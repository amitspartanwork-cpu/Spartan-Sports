<?php
declare(strict_types=1);

$config = require __DIR__ . '/config.php';
$https = strtolower((string)($_SERVER['HTTPS'] ?? ''));
$secureCookie = ($https !== '' && $https !== 'off') || (int)($_SERVER['SERVER_PORT'] ?? 0) === 443;
session_name('spartan_inventory_session');
session_set_cookie_params([
  'httponly' => true,
  'samesite' => 'Strict',
  'secure' => $secureCookie,
  'path' => '/',
]);
session_start();
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function respond(int $status, array $data): void {
  http_response_code($status);
  echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
  exit;
}

function fail(int $status, string $message): void {
  respond($status, ['error' => $message]);
}

function readInput(): array {
  $raw = file_get_contents('php://input');
  if ($raw === false || strlen($raw) > 2_000_000) fail(413, 'Request is too large.');
  $input = json_decode($raw, true);
  if (!is_array($input)) fail(400, 'Invalid JSON request.');
  return $input;
}

function requireMethod(string $method): void {
  if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
    header('Allow: ' . $method);
    fail(405, $method . ' required.');
  }
}

function requireUser(PDO $pdo): array {
  $id = (int)($_SESSION['inventory_user_id'] ?? 0);
  if ($id < 1) fail(401, 'Please sign in.');
  $stmt = $pdo->prepare('SELECT id,name,email,role,department FROM inventory_users WHERE id=?');
  $stmt->execute([$id]);
  $user = $stmt->fetch();
  if (!$user) {
    session_destroy();
    fail(401, 'Please sign in again.');
  }
  return $user;
}

function requireAdmin(PDO $pdo): array {
  $user = requireUser($pdo);
  if ($user['role'] !== 'admin') fail(403, 'Administrator access required.');
  return $user;
}

function validText($value, int $maxLength): bool {
  return is_string($value) && trim($value) !== '' && strlen($value) <= $maxLength && preg_match('//u', $value) === 1;
}

function validNumber($value): bool {
  return (is_int($value) || is_float($value) || (is_string($value) && trim($value) !== ''))
    && is_numeric($value) && is_finite((float)$value) && (float)$value >= 0 && (float)$value <= 1_000_000_000_000;
}

function keyForName(string $name, array &$usedKeys): string {
  $key = strtolower(trim($name));
  $key = preg_replace('/[^a-z0-9]+/', '-', $key);
  $key = trim((string)$key, '-');
  if ($key === '') $key = 'material-' . substr(hash('sha256', $name), 0, 12);
  $key = substr($key, 0, 90);
  $base = $key;
  $suffix = 2;
  while (isset($usedKeys[$key])) {
    $ending = '-' . $suffix++;
    $key = substr($base, 0, 90 - strlen($ending)) . $ending;
  }
  $usedKeys[$key] = true;
  return $key;
}

try {
  $pdo = new PDO(
    "mysql:host={$config['host']};dbname={$config['db']};charset=utf8mb4",
    $config['user'],
    $config['pass'],
    [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
      PDO::ATTR_EMULATE_PREPARES => false,
    ]
  );
  $pdo->exec("CREATE TABLE IF NOT EXISTS inventory_users (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    email VARCHAR(190) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin','staff') NOT NULL DEFAULT 'staff',
    department VARCHAR(80) NOT NULL DEFAULT 'Warehouse',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB");
  $pdo->exec("CREATE TABLE IF NOT EXISTS inventory_materials (
    material_key VARCHAR(100) NOT NULL PRIMARY KEY,
    name VARCHAR(150) NOT NULL UNIQUE,
    category VARCHAR(80) NOT NULL,
    stock DECIMAL(14,3) NOT NULL DEFAULT 0,
    needed DECIMAL(14,3) NOT NULL DEFAULT 0,
    unit VARCHAR(40) NOT NULL DEFAULT 'pcs',
    unit_price DECIMAL(14,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB");

  if ((int)$pdo->query('SELECT COUNT(*) FROM inventory_materials')->fetchColumn() === 0) {
    $defaults = [
      ['leather', 'Cowhide leather', 'Leather', 120, 90, 'sq m', 850],
      ['rubber', 'Natural rubber', 'Rubber', 40, 55, 'kg', 210],
      ['willow', 'English willow clefts', 'Wood', 18, 25, 'pcs', 3200],
      ['ash', 'Ash wood billets', 'Wood', 60, 40, 'pcs', 650],
      ['steel', 'Stainless steel wire', 'Metal', 300, 200, 'm', 45],
      ['mesh', 'Polyester mesh', 'Fabric', 9, 8, 'rolls', 1200],
    ];
    $insertDefaults = $pdo->prepare('INSERT INTO inventory_materials (material_key,name,category,stock,needed,unit,unit_price) VALUES (?,?,?,?,?,?,?)');
    foreach ($defaults as $row) $insertDefaults->execute($row);
  }

  $action = (string)($_GET['action'] ?? 'me');
  $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
  $userCount = (int)$pdo->query('SELECT COUNT(*) FROM inventory_users')->fetchColumn();

  if ($action === 'me') {
    requireMethod('GET');
    $user = null;
    if (!empty($_SESSION['inventory_user_id'])) {
      $stmt = $pdo->prepare('SELECT id,name,email,role,department FROM inventory_users WHERE id=?');
      $stmt->execute([(int)$_SESSION['inventory_user_id']]);
      $user = $stmt->fetch() ?: null;
      if (!$user) {
        unset($_SESSION['inventory_user_id']);
      }
    }
    respond(200, ['user' => $user, 'needsSetup' => $userCount === 0]);
  }

  if ($action === 'setup') {
    requireMethod('POST');
    if ($userCount > 0) fail(403, 'Initial administrator setup is already complete.');
    $input = readInput();
    $setupKey = (string)($config['setup_key'] ?? '');
    if ($setupKey === '' || $setupKey === 'change-this-key') {
      fail(503, 'Set a private setup_key in files (2)/config.php before creating the first admin.');
    }
    if (!hash_equals($setupKey, (string)($input['setupKey'] ?? ''))) {
      usleep(800000);
      fail(403, 'Invalid setup key.');
    }
    $name = trim((string)($input['name'] ?? ''));
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');
    if (!validText($name, 120) || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
      fail(422, 'Enter a valid name and email address.');
    }
    if (strlen($password) < 10) fail(422, 'Use a password with at least 10 characters.');
    $stmt = $pdo->prepare("INSERT INTO inventory_users (name,email,password_hash,role,department) VALUES (?,?,?,'admin','Management')");
    try {
      $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT)]);
    } catch (PDOException $e) {
      if ($e->getCode() === '23000') fail(409, 'An account with that email already exists.');
      throw $e;
    }
    session_regenerate_id(true);
    $_SESSION['inventory_user_id'] = (int)$pdo->lastInsertId();
    respond(201, ['user' => requireUser($pdo)]);
  }

  if ($action === 'login') {
    requireMethod('POST');
    $input = readInput();
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');
    $stmt = $pdo->prepare('SELECT id,password_hash FROM inventory_users WHERE email=?');
    $stmt->execute([$email]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($password, $row['password_hash'])) {
      usleep(700000);
      fail(401, 'Email or password is incorrect.');
    }
    session_regenerate_id(true);
    $_SESSION['inventory_user_id'] = (int)$row['id'];
    respond(200, ['user' => requireUser($pdo)]);
  }

  if ($action === 'logout') {
    requireMethod('POST');
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
      $params = session_get_cookie_params();
      setcookie(session_name(), '', time() - 42000, $params['path'], '', $params['secure'], $params['httponly']);
    }
    session_destroy();
    respond(200, ['ok' => true]);
  }

  $user = requireUser($pdo);

  if ($action === 'inventory') {
    requireMethod('GET');
    $rows = $pdo->query('SELECT material_key AS `key`,name,category AS cat,stock,needed AS need,unit,unit_price AS price FROM inventory_materials ORDER BY name')->fetchAll();
    foreach ($rows as &$row) {
      $row['stock'] = (float)$row['stock'];
      $row['need'] = (float)$row['need'];
      $row['price'] = (float)$row['price'];
    }
    unset($row);
    respond(200, ['materials' => $rows, 'user' => $user]);
  }

  if ($action === 'users') {
    requireMethod('GET');
    requireAdmin($pdo);
    $rows = $pdo->query('SELECT id,name,email,role,department,created_at AS createdAt FROM inventory_users ORDER BY created_at DESC,id DESC')->fetchAll();
    respond(200, ['users' => $rows]);
  }

  if ($action === 'create_user') {
    requireMethod('POST');
    requireAdmin($pdo);
    $input = readInput();
    $name = trim((string)($input['name'] ?? ''));
    $email = strtolower(trim((string)($input['email'] ?? '')));
    $password = (string)($input['password'] ?? '');
    $role = (string)($input['role'] ?? 'staff');
    $department = trim((string)($input['department'] ?? 'Warehouse'));
    if (!validText($name, 120) || !filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email) > 190) {
      fail(422, 'Enter a valid name and email address.');
    }
    if (strlen($password) < 10) fail(422, 'Use a password with at least 10 characters.');
    if (!in_array($role, ['admin', 'staff'], true)) fail(422, 'Invalid role.');
    if (!validText($department, 80)) $department = 'Warehouse';
    $stmt = $pdo->prepare('INSERT INTO inventory_users (name,email,password_hash,role,department) VALUES (?,?,?,?,?)');
    try {
      $stmt->execute([$name, $email, password_hash($password, PASSWORD_DEFAULT), $role, $department]);
    } catch (PDOException $e) {
      if ($e->getCode() === '23000') fail(409, 'An account with that email already exists.');
      throw $e;
    }
    respond(201, ['id' => (int)$pdo->lastInsertId()]);
  }

  if ($action === 'delete_user') {
    requireMethod('POST');
    requireAdmin($pdo);
    $input = readInput();
    $id = filter_var($input['id'] ?? null, FILTER_VALIDATE_INT);
    if (!$id || $id === (int)$user['id']) fail(422, 'You cannot delete this account.');
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM inventory_users WHERE role='admin'");
    $stmt->execute();
    $adminCount = (int)$stmt->fetchColumn();
    $stmt = $pdo->prepare('SELECT role FROM inventory_users WHERE id=?');
    $stmt->execute([$id]);
    $targetRole = $stmt->fetchColumn();
    if ($targetRole === false) fail(404, 'Account not found.');
    if ($targetRole === 'admin' && $adminCount <= 1) fail(409, 'The last administrator cannot be deleted.');
    $stmt = $pdo->prepare('DELETE FROM inventory_users WHERE id=?');
    $stmt->execute([$id]);
    respond(200, ['ok' => true]);
  }

  if ($action === 'merge_inventory') {
    requireMethod('POST');
    requireAdmin($pdo);
    $input = readInput();
    $items = $input['materials'] ?? null;
    if (!is_array($items) || count($items) < 1 || count($items) > 1000) {
      fail(422, 'Upload between 1 and 1000 valid inventory rows.');
    }
    $validated = [];
    $namesInUpload = [];
    foreach ($items as $index => $item) {
      if (!is_array($item)) fail(422, 'Invalid data on spreadsheet row ' . ($index + 2) . '.');
      $name = trim((string)($item['name'] ?? ''));
      $category = trim((string)($item['cat'] ?? 'Uncategorized'));
      $unit = trim((string)($item['unit'] ?? 'pcs'));
      if (!validText($name, 150) || !validText($category, 80) || !validText($unit, 40)
        || !validNumber($item['stock'] ?? null) || !validNumber($item['need'] ?? null)
        || !validNumber($item['price'] ?? null)) {
        fail(422, 'Invalid name, category, unit, stock, needed, or price on spreadsheet row ' . ($index + 2) . '.');
      }
      $nameKey = strtolower($name);
      if (isset($namesInUpload[$nameKey])) fail(422, 'Duplicate material name in the spreadsheet: ' . $name . '.');
      $namesInUpload[$nameKey] = true;
      $validated[] = [
        'name' => $name,
        'category' => $category,
        'unit' => $unit,
        'stock' => (float)$item['stock'],
        'need' => (float)$item['need'],
        'price' => (float)$item['price'],
      ];
    }

    $pdo->beginTransaction();
    $current = $pdo->query('SELECT material_key,name FROM inventory_materials')->fetchAll();
    $keyByName = [];
    $usedKeys = [];
    foreach ($current as $row) {
      $keyByName[strtolower($row['name'])] = $row['material_key'];
      $usedKeys[$row['material_key']] = true;
    }
    $update = $pdo->prepare('UPDATE inventory_materials SET name=?,category=?,stock=?,needed=?,unit=?,unit_price=? WHERE material_key=?');
    $insert = $pdo->prepare('INSERT INTO inventory_materials (material_key,name,category,stock,needed,unit,unit_price) VALUES (?,?,?,?,?,?,?)');
    $added = 0;
    $updated = 0;
    foreach ($validated as $item) {
      $nameKey = strtolower($item['name']);
      if (isset($keyByName[$nameKey])) {
        $key = $keyByName[$nameKey];
        $update->execute([$item['name'],$item['category'],$item['stock'],$item['need'],$item['unit'],$item['price'],$key]);
        $updated++;
      } else {
        $key = keyForName($item['name'], $usedKeys);
        $insert->execute([$key,$item['name'],$item['category'],$item['stock'],$item['need'],$item['unit'],$item['price']]);
        $keyByName[$nameKey] = $key;
        $added++;
      }
    }
    $pdo->commit();
    respond(200, ['added' => $added, 'updated' => $updated]);
  }

  fail(404, 'Unknown action.');
} catch (Throwable $e) {
  if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) $pdo->rollBack();
  error_log($e->getMessage());
  fail(500, 'Server error. Check the PHP and MySQL configuration.');
}
