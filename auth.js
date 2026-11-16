"use strict";

const INVENTORY_API = "files (2)/inventory_api.php";
const STATIC_PREVIEW = location.hostname.endsWith(".github.io");
const PREVIEW_STORAGE_KEY = "spartan-sports-preview-inventory";
const DEMO_MATERIAL_KEYS = new Map([
  ["cowhide leather", "leather"],
  ["natural rubber", "rubber"],
  ["english willow clefts", "willow"],
  ["ash wood billets", "ash"],
  ["stainless steel wire", "steel"],
  ["polyester mesh", "mesh"]
]);
const DEFAULT_PREVIEW_INVENTORY = [
  { key: "leather", name: "Cowhide leather", cat: "Leather", stock: 120, need: 90, unit: "sq m", price: 850 },
  { key: "rubber", name: "Natural rubber", cat: "Rubber", stock: 40, need: 55, unit: "kg", price: 210 },
  { key: "willow", name: "English willow clefts", cat: "Wood", stock: 18, need: 25, unit: "pcs", price: 3200 },
  { key: "ash", name: "Ash wood billets", cat: "Wood", stock: 60, need: 40, unit: "pcs", price: 650 },
  { key: "steel", name: "Stainless steel wire", cat: "Metal", stock: 300, need: 200, unit: "m", price: 45 },
  { key: "mesh", name: "Polyester mesh", cat: "Fabric", stock: 9, need: 8, unit: "rolls", price: 1200 }
];

async function apiRequest(action, options) {
  const request = options || {};
  let response;
  try {
    response = await fetch(`${INVENTORY_API}?action=${encodeURIComponent(action)}`, {
      method: request.method || "GET",
      credentials: "same-origin",
      headers: request.body ? { "Content-Type": "application/json" } : {},
      body: request.body ? JSON.stringify(request.body) : undefined
    });
  } catch {
    throw new Error("Cannot reach the PHP API. Start Apache and MySQL, then open the site through XAMPP.");
  }

  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("The PHP API did not return JSON. Open the site through Apache, not Live Server.");
  }
  if (!response.ok) throw new Error(result.error || "The request failed.");
  return result;
}

function showMessage(id, message, success) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = `alert show ${success ? "success" : "error"}`;
}

function toast(message) {
  const element = document.getElementById("toast");
  if (!element) return;
  element.textContent = message;
  element.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove("show"), 2800);
}

function setBusy(form, busy) {
  const button = form.querySelector('button[type="submit"]');
  if (button) button.disabled = busy;
}

async function initLoginPage() {
  const loginPanel = document.getElementById("loginPanel");
  const setupPanel = document.getElementById("setupPanel");
  const loginForm = document.getElementById("loginForm");
  const setupForm = document.getElementById("setupForm");
  if (STATIC_PREVIEW) {
    loginPanel.hidden = true;
    setupPanel.hidden = true;
    document.getElementById("demoLoginPanel").hidden = false;
    initDemoLoginPage();
    initStaticDemoImport();
    return;
  }

  try {
    const state = await apiRequest("me");
    if (state.user) {
      location.replace(state.user.role === "admin" ? "admin-dashboard.html" : "index.html");
      return;
    }
    setupPanel.hidden = !state.needsSetup;
    loginPanel.hidden = state.needsSetup;
  } catch (error) {
    loginPanel.hidden = false;
    setupPanel.hidden = true;
    showMessage("loginAlert", error.message);
    return;
  }

  loginForm.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(loginForm, true);
    try {
      const result = await apiRequest("login", {
        method: "POST",
        body: {
          email: document.getElementById("loginEmail").value.trim(),
          password: document.getElementById("loginPass").value
        }
      });
      location.assign(result.user.role === "admin" ? "admin-dashboard.html" : "index.html");
    } catch (error) {
      showMessage("loginAlert", error.message);
      setBusy(loginForm, false);
    }
  });

  setupForm.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(setupForm, true);
    try {
      await apiRequest("setup", {
        method: "POST",
        body: {
          setupKey: document.getElementById("setupKey").value,
          name: document.getElementById("setupName").value.trim(),
          email: document.getElementById("setupEmail").value.trim(),
          password: document.getElementById("setupPassword").value
        }
      });
      location.assign("admin-dashboard.html");
    } catch (error) {
      showMessage("setupAlert", error.message);
      setBusy(setupForm, false);
    }
  });
}

async function initInventoryPage() {
  const status = document.getElementById("authStatus");
  document.getElementById("navSignout")?.addEventListener("click", doSignOut);
  if (STATIC_PREVIEW) {
    const signIn = document.getElementById("navAuth");
    if (signIn) signIn.textContent = "Demo sign in";
    ["navAdmin", "navSignout"].forEach(id => {
      const link = document.getElementById(id);
      if (link) link.hidden = true;
    });
    let previewMessage = "Presentation preview: sample data only. Demo login is not secure; imported data stays in this browser.";
    try {
      const saved = localStorage.getItem(PREVIEW_STORAGE_KEY);
      if (saved !== null) {
        const materials = JSON.parse(saved);
        window.refreshInventory(materials);
        previewMessage = "Presentation preview: imported data is stored only in this browser and is not shared.";
      }
    } catch (error) {
      console.error("Could not load browser-only inventory data:", error);
      previewMessage = "Could not load previous preview data. The sample inventory is shown instead.";
    }
    if (status) {
      status.textContent = previewMessage;
    }
    const main = document.getElementById("siteMain");
    if (main) main.hidden = false;
    return;
  }

  try {
    const session = await apiRequest("me");
    if (!session.user) {
      location.replace("login.html");
      return;
    }
    const signIn = document.getElementById("navAuth");
    const signOut = document.getElementById("navSignout");
    const adminLink = document.getElementById("navAdmin");
    if (signIn) {
      signIn.textContent = session.user.name;
      signIn.href = session.user.role === "admin" ? "admin-dashboard.html" : "#top";
    }
    if (signOut) signOut.style.display = "inline";
    if (adminLink && session.user.role === "admin") adminLink.style.display = "inline";

    const inventory = await apiRequest("inventory");
    if (typeof window.refreshInventory !== "function") {
      throw new Error("Inventory page failed to initialize. Reload and try again.");
    }
    window.refreshInventory(inventory.materials);
    if (status) status.hidden = true;
    document.getElementById("siteMain").hidden = false;
  } catch (error) {
    if (status) {
      status.hidden = false;
      status.textContent = error.message;
    }
    document.getElementById("siteMain").hidden = true;
  }
}

async function doSignOut(event) {
  if (event) event.preventDefault();
  try {
    await apiRequest("logout", { method: "POST", body: {} });
    location.assign("login.html");
  } catch (error) {
    toast(error.message);
  }
}

function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parseInventorySheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) throw new Error("The spreadsheet has no inventory rows.");
  const aliases = {
    name: ["material", "name", "item", "material name"],
    cat: ["category", "cat", "type"],
    stock: ["stock", "in stock", "qty", "quantity", "on hand"],
    need: ["need", "needed", "needed for open orders", "required", "order quantity"],
    unit: ["unit", "uom"],
    price: ["price", "unit price", "unit price (₹)", "cost", "rate"]
  };
  const headers = rows[0].map(normalizeHeader);
  const columns = Object.fromEntries(Object.entries(aliases).map(([field, names]) => [
    field, headers.findIndex(header => names.includes(header))
  ]));
  if (columns.name < 0 || columns.stock < 0) {
    throw new Error("Required columns are Material/Name and Stock. Category, Needed, Unit, and Price are optional.");
  }

  const materials = [];
  const seen = new Set();
  const errors = [];
  rows.slice(1).forEach((row, index) => {
    if (row.every(value => String(value).trim() === "")) return;
    const value = field => columns[field] < 0 ? "" : row[columns[field]];
    const name = String(value("name")).trim();
    const stockText = String(value("stock")).trim();
    const needText = String(value("need")).trim();
    const priceText = String(value("price")).trim();
    const stock = Number(stockText);
    const need = needText === "" ? 0 : Number(needText);
    const price = priceText === "" ? 0 : Number(priceText);
    const nameKey = name.toLowerCase();
    if (!name || stockText === "" || !Number.isFinite(stock) || stock < 0 || !Number.isFinite(need) || need < 0
      || !Number.isFinite(price) || price < 0) {
      errors.push(`Row ${index + 2}: provide a material name and non-negative numeric stock, needed, and price values.`);
      return;
    }
    if (seen.has(nameKey)) {
      errors.push(`Row ${index + 2}: duplicate material "${name}".`);
      return;
    }
    seen.add(nameKey);
    materials.push({
      name,
      cat: String(value("cat")).trim() || "Uncategorized",
      stock,
      need,
      unit: String(value("unit")).trim() || "pcs",
      price
    });
  });
  if (errors.length) throw new Error(errors.slice(0, 5).join(" "));
  if (!materials.length) throw new Error("No valid inventory rows were found.");
  return materials;
}

function renderImportPreview(materials, previewId = "importPreviewAdmin", actionsId = "importActionsAdmin") {
  const preview = document.getElementById(previewId);
  preview.replaceChildren();
  const summary = document.createElement("p");
  summary.textContent = `${materials.length} rows ready. Matching names will be updated; new names will be added.`;
  preview.appendChild(summary);
  const table = document.createElement("table");
  table.innerHTML = "<thead><tr><th>Material</th><th>Category</th><th>Stock</th><th>Needed</th><th>Unit</th><th>Price</th></tr></thead>";
  const body = document.createElement("tbody");
  materials.slice(0, 8).forEach(material => {
    const row = body.insertRow();
    [material.name, material.cat, material.stock, material.need, material.unit, material.price].forEach(value => {
      row.insertCell().textContent = String(value);
    });
  });
  if (materials.length > 8) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 6;
    cell.textContent = `… and ${materials.length - 8} more rows`;
  }
  table.appendChild(body);
  preview.appendChild(table);
  preview.hidden = false;
  document.getElementById(actionsId).hidden = false;
}

function initDemoLoginPage() {
  const roleInput = document.getElementById("demoRole");
  const signInButton = document.getElementById("demoLoginButton");
  document.querySelectorAll("[data-demo-role]").forEach(button => {
    button.addEventListener("click", () => {
      const isAdmin = button.dataset.demoRole === "admin";
      roleInput.value = isAdmin ? "admin" : "user";
      document.querySelectorAll("[data-demo-role]").forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-pressed", String(active));
      });
      signInButton.textContent = isAdmin ? "Open admin preview →" : "Open user preview →";
    });
  });
  document.getElementById("demoLoginForm").addEventListener("submit", event => {
    event.preventDefault();
    const role = roleInput.value;
    location.assign(role === "admin" ? "admin-dashboard.html" : "index.html");
  });
}

function staticPreviewRows(materials) {
  return materials.map((material, index) => {
    const nameKey = material.name.toLowerCase();
    const slug = nameKey.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || `material-${index + 1}`;
    return {
      key: DEMO_MATERIAL_KEYS.get(nameKey) || `import-${slug}-${index + 1}`,
      name: material.name,
      cat: material.cat,
      stock: material.stock,
      need: material.need,
      unit: material.unit,
      price: material.price
    };
  });
}

function readStaticPreviewRows() {
  const saved = localStorage.getItem(PREVIEW_STORAGE_KEY);
  if (saved === null) return DEFAULT_PREVIEW_INVENTORY.map(row => ({ ...row }));
  const rows = JSON.parse(saved);
  if (!Array.isArray(rows) || rows.some(row => !row || typeof row.key !== "string"
    || typeof row.name !== "string" || typeof row.cat !== "string" || typeof row.unit !== "string"
    || !Number.isFinite(row.stock) || !Number.isFinite(row.need) || !Number.isFinite(row.price))) {
    throw new Error("Saved preview data is invalid. Clear it and import the spreadsheet again.");
  }
  return rows;
}

function mergeStaticPreviewRows(importedRows) {
  const byName = new Map(readStaticPreviewRows().map(row => [row.name.trim().toLowerCase(), row]));
  importedRows.forEach(row => {
    const nameKey = row.name.trim().toLowerCase();
    const current = byName.get(nameKey);
    byName.set(nameKey, current ? { ...current, ...row, key: current.key } : row);
  });
  return [...byName.values()];
}

function initStaticDemoImport() {
  const staticDashboard = document.getElementById("staticAdminDemo");
  const ids = staticDashboard ? {
    file: "demoImportFileAdmin",
    drop: "demoDropZoneAdmin",
    preview: "demoImportPreviewAdmin",
    actions: "demoImportActionsAdmin",
    apply: "demoApplyImportBtn",
    clear: "demoClearImportAdminBtn"
  } : {
    file: "importFileAdmin",
    drop: "dropZoneAdmin",
    preview: "importPreviewAdmin",
    actions: "importActionsAdmin",
    apply: "applyImportBtn",
    clear: "clearImportAdminBtn"
  };
  const fileInput = document.getElementById(ids.file);
  const dropZone = document.getElementById(ids.drop);
  if (!fileInput || !dropZone) return;

  const messageId = document.getElementById("dashboardAlert") ? "dashboardAlert" : "demoImportAlert";
  const selectFile = async file => {
    if (!file) return;
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choose an .xlsx, .xls, or .csv file.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Spreadsheet files must be 10 MB or smaller.");
      if (typeof XLSX === "undefined") throw new Error("The spreadsheet reader did not load. Reload and try again.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      window.pendingInventoryImport = parseInventorySheet(workbook.Sheets[workbook.SheetNames[0]]);
      renderImportPreview(window.pendingInventoryImport, ids.preview, ids.actions);
      showMessage(messageId, `${window.pendingInventoryImport.length} rows ready to load into this browser.`, true);
    } catch (error) {
      showMessage(messageId, error.message, false);
    }
  };

  fileInput.addEventListener("change", () => selectFile(fileInput.files[0]));
  dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
  dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("over");
    selectFile(event.dataTransfer.files[0]);
  });
  document.getElementById(ids.apply).addEventListener("click", () => {
    if (!window.pendingInventoryImport?.length) return;
    try {
      const rows = mergeStaticPreviewRows(staticPreviewRows(window.pendingInventoryImport));
      localStorage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify(rows));
      showMessage(messageId, `${rows.length} materials are ready in this browser's preview.`, true);
    } catch (error) {
      showMessage(messageId, `Could not save preview data: ${error.message}`, false);
    }
  });
  document.getElementById(ids.clear).addEventListener("click", () => {
    window.pendingInventoryImport = null;
    fileInput.value = "";
    document.getElementById(ids.preview).replaceChildren();
    document.getElementById(ids.preview).hidden = true;
    document.getElementById(ids.actions).hidden = true;
    const message = document.getElementById(messageId);
    message.className = "alert";
    message.textContent = "";
  });
}

async function initAdminDashboard() {
  const main = document.getElementById("dashMain");
  const signOutButton = document.getElementById("signoutBtn");
  if (STATIC_PREVIEW) {
    if (main) main.hidden = true;
    const demoMain = document.getElementById("staticAdminDemo");
    if (demoMain) demoMain.hidden = false;
    signOutButton?.addEventListener("click", () => {
      location.assign("login.html");
    });
    initStaticDemoImport();
    return;
  }

  signOutButton?.addEventListener("click", doSignOut);
  try {
    const session = await apiRequest("me");
    if (!session.user) {
      location.replace("login.html");
      return;
    }
    if (session.user.role !== "admin") {
      location.replace("index.html");
      return;
    }
    main.hidden = false;
    document.getElementById("adminName").textContent = session.user.name;
    await loadAdminUsers();
  } catch (error) {
    showMessage("dashboardAlert", error.message);
    return;
  }

  const userForm = document.getElementById("adminAddUserForm");
  userForm.addEventListener("submit", async event => {
    event.preventDefault();
    setBusy(userForm, true);
    try {
      await apiRequest("create_user", {
        method: "POST",
        body: {
          name: document.getElementById("newUserName").value.trim(),
          email: document.getElementById("newUserEmail").value.trim(),
          password: document.getElementById("newUserPass").value,
          role: document.getElementById("newUserRole").value,
          department: document.getElementById("newUserDept").value
        }
      });
      userForm.reset();
      await loadAdminUsers();
      toast("Account created.");
    } catch (error) {
      showMessage("dashboardAlert", error.message);
    } finally {
      setBusy(userForm, false);
    }
  });

  const fileInput = document.getElementById("importFileAdmin");
  const dropZone = document.getElementById("dropZoneAdmin");
  const selectFile = async file => {
    if (!file) return;
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) throw new Error("Choose an .xlsx, .xls, or .csv file.");
      if (file.size > 10 * 1024 * 1024) throw new Error("Spreadsheet files must be 10 MB or smaller.");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      window.pendingInventoryImport = parseInventorySheet(workbook.Sheets[workbook.SheetNames[0]]);
      renderImportPreview(window.pendingInventoryImport);
      document.getElementById("dashboardAlert").className = "alert";
    } catch (error) {
      showMessage("dashboardAlert", error.message);
    }
  };
  fileInput.addEventListener("change", () => selectFile(fileInput.files[0]));
  dropZone.addEventListener("dragover", event => {
    event.preventDefault();
    dropZone.classList.add("over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("over"));
  dropZone.addEventListener("drop", event => {
    event.preventDefault();
    dropZone.classList.remove("over");
    selectFile(event.dataTransfer.files[0]);
  });

  document.getElementById("applyImportBtn").addEventListener("click", async event => {
    const button = event.currentTarget;
    if (!window.pendingInventoryImport?.length) return;
    button.disabled = true;
    try {
      const result = await apiRequest("merge_inventory", {
        method: "POST",
        body: { materials: window.pendingInventoryImport }
      });
      toast(`Saved: ${result.added} added, ${result.updated} updated.`);
      window.pendingInventoryImport = null;
      fileInput.value = "";
      document.getElementById("importPreviewAdmin").hidden = true;
      document.getElementById("importActionsAdmin").hidden = true;
    } catch (error) {
      showMessage("dashboardAlert", error.message);
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("clearImportAdminBtn").addEventListener("click", () => {
    window.pendingInventoryImport = null;
    fileInput.value = "";
    document.getElementById("importPreviewAdmin").replaceChildren();
    document.getElementById("importPreviewAdmin").hidden = true;
    document.getElementById("importActionsAdmin").hidden = true;
  });
}

let adminUsers = [];

async function loadAdminUsers() {
  const result = await apiRequest("users");
  adminUsers = result.users;
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("statUsers").textContent = adminUsers.length;
  document.getElementById("statAdmins").textContent = adminUsers.filter(user => user.role === "admin").length;
  document.getElementById("statStaff").textContent = adminUsers.filter(user => user.role === "staff").length;
  document.getElementById("userCountBadge").textContent = adminUsers.length;
  renderAdminUsers();
  document.getElementById("statToday").textContent = adminUsers.filter(user => String(user.createdAt || "").startsWith(today)).length;
}

function renderAdminUsers() {
  const query = document.getElementById("userSearchInput").value.trim().toLowerCase();
  const users = adminUsers.filter(user => [user.name, user.email, user.department, user.role]
    .some(value => String(value).toLowerCase().includes(query)));
  const tbody = document.getElementById("userTableBody");
  tbody.replaceChildren();
  users.forEach((user, index) => {
    const row = tbody.insertRow();
    [index + 1, user.name, user.email, user.department, user.role, String(user.createdAt || "").slice(0, 10)].forEach(value => {
      row.insertCell().textContent = String(value);
    });
    const action = row.insertCell();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn-sm";
    button.textContent = "Delete";
    button.addEventListener("click", async () => {
      if (!confirm(`Delete the account for ${user.name}?`)) return;
      button.disabled = true;
      try {
        await apiRequest("delete_user", { method: "POST", body: { id: user.id } });
        await loadAdminUsers();
      } catch (error) {
        showMessage("dashboardAlert", error.message);
        button.disabled = false;
      }
    });
    action.appendChild(button);
  });
  document.getElementById("noUsersMsg").hidden = users.length > 0;
}

function initializeAuthPages() {
  if (document.getElementById("loginForm")) initLoginPage();
  if (document.getElementById("dashMain")) initAdminDashboard();
  document.getElementById("userSearchInput")?.addEventListener("input", renderAdminUsers);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeAuthPages, { once: true });
} else {
  initializeAuthPages();
}
