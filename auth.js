"use strict";

const INVENTORY_API = "files (2)/inventory_api.php";

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

function renderImportPreview(materials) {
  const preview = document.getElementById("importPreviewAdmin");
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
  document.getElementById("importActionsAdmin").hidden = false;
}

async function initAdminDashboard() {
  const main = document.getElementById("dashMain");
  document.getElementById("signoutBtn")?.addEventListener("click", doSignOut);
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
