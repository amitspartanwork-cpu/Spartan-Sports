/* ==========================================================
   auth.js — Spartan Sports Login / Register + Excel Import
   ========================================================== */

"use strict";

const $ = s => document.querySelector(s);

/* ── Toast ────────────────────────────────────────────────── */
function toast(msg, dur = 2600) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), dur);
}

/* ── Alert ────────────────────────────────────────────────── */
function showAlert(id, msg, type = "error") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = "alert " + type + " show";
}
function clearAlert(id) {
  const el = document.getElementById(id);
  if (el) el.className = "alert";
}

/* ── Password toggle ──────────────────────────────────────── */
function togglePw(inputId, btn) {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  const isHidden = inp.type === "password";
  inp.type = isHidden ? "text" : "password";
  btn.textContent = isHidden ? "🙈" : "👁";
}

/* Simple reversible encode — NOT for real production use */
function encodePass(p) { return btoa(unescape(encodeURIComponent(p))); }
function checkPass(plain, stored) { return encodePass(plain) === stored; }

/* ── Storage helpers ──────────────────────────────────────── */
const USERS_KEY   = "ss_users";
const SESSION_KEY = "ss_session";
const ADMIN_SECRET = "SPARTAN2024";

/* Default seed accounts if storage is empty */
const DEFAULT_USERS = [
  {
    id: 1700000000001,
    name: "Spartan Admin",
    email: "admin@spartan.com",
    role: "admin",
    dept: "Management",
    password: "YWRtaW4xMjM0NQ==", // admin12345
    createdAt: new Date().toISOString()
  },
  {
    id: 1700000000002,
    name: "John Warehouse",
    email: "john@spartan.com",
    role: "user",
    dept: "Warehouse",
    password: "dXNlcjEyMzQ1", // user12345
    createdAt: new Date().toISOString()
  }
];

function getUsers() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) {
      localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(USERS_KEY, JSON.stringify(DEFAULT_USERS));
      return DEFAULT_USERS;
    }
    return parsed;
  } catch {
    return DEFAULT_USERS;
  }
}
function saveUsers(arr) {
  localStorage.setItem(USERS_KEY, JSON.stringify(arr));
}

/* ── Current page detection ───────────────────────────────── */
const PAGE = window.location.pathname.split("/").pop() || "index.html";
const IS_LOGIN    = PAGE === "login.html";
const IS_REGISTER = PAGE === "register.html";
const IS_ADMIN    = PAGE === "admin-dashboard.html";
const IS_INDEX    = PAGE === "index.html" || PAGE === "";

/* ── Session ──────────────────────────────────────────────── */
function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); }
  catch { return null; }
}
function setSession(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify({
    name:  user.name,
    email: user.email,
    role:  user.role
  }));
}

/* Redirect logged-in users away from login page */
if (IS_LOGIN) {
  const sess = getSession();
  if (sess) {
    window.location.replace(sess.role === "admin" ? "admin-dashboard.html" : "index.html");
  }
}

/* Guard admin dashboard */
if (IS_ADMIN) {
  const sess = getSession();
  if (sess && sess.role !== "admin") {
    // If logged in as standard user and trying to access admin dashboard, prompt them
    toast("Admin access required.");
  }
}

/* ── Role tabs ────────────────────────────────────────────── */
let currentRole    = "user";
let currentRegRole = "user";

function setRole(role) {
  currentRole = role;
  document.querySelectorAll(".role-tabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.role === role);
  });
  const kg = document.getElementById("adminKeyGroup");
  if (kg) kg.style.display = role === "admin" ? "block" : "none";
  clearAlert("loginAlert");
}

function setRegRole(role) {
  currentRegRole = role;
  document.querySelectorAll(".role-tabs button").forEach(b => {
    b.classList.toggle("active", b.dataset.role === role);
  });
  const kg = document.getElementById("adminKeyGroupReg");
  if (kg) kg.style.display = role === "admin" ? "block" : "none";
  clearAlert("regAlert");
}

/* ── LOGIN ────────────────────────────────────────────────── */
const loginForm = document.getElementById("loginForm");
if (loginForm) {
  loginForm.addEventListener("submit", e => {
    e.preventDefault();
    clearAlert("loginAlert");

    const email    = (document.getElementById("loginEmail")?.value || "").trim().toLowerCase();
    const password = document.getElementById("loginPass")?.value || "";
    const adminKey = document.getElementById("loginAdminKey")?.value || "";

    if (!email || !password)
      return showAlert("loginAlert", "Please enter your email and password.");

    const users = getUsers();
    const user  = users.find(u => u.email.toLowerCase() === email);

    if (!user)
      return showAlert("loginAlert", "No account found with this email. Please register first.");

    if (currentRole === "admin" && user.role !== "admin" && adminKey !== ADMIN_SECRET)
      return showAlert("loginAlert", "This is not an admin account. Switch to User tab or enter admin key.");

    if (!checkPass(password, user.password))
      return showAlert("loginAlert", "Incorrect password. Please try again.");

    setSession(user);
    showAlert("loginAlert", "Welcome back, " + user.name + "! Redirecting…", "success");

    setTimeout(() => {
      window.location.href = user.role === "admin" ? "admin-dashboard.html" : "index.html";
    }, 700);
  });
}

/* ── REGISTER ─────────────────────────────────────────────── */
const regForm = document.getElementById("regForm");
if (regForm) {
  regForm.addEventListener("submit", e => {
    e.preventDefault();
    clearAlert("regAlert");

    const name     = (document.getElementById("regName")?.value || "").trim();
    const email    = (document.getElementById("regEmail")?.value || "").trim().toLowerCase();
    const password = document.getElementById("regPass")?.value || "";
    const adminKey = document.getElementById("regAdminKey")?.value || "";

    if (!name)
      return showAlert("regAlert", "Please enter your name.");
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return showAlert("regAlert", "Please enter a valid email address.");
    if (password.length < 6)
      return showAlert("regAlert", "Password must be at least 6 characters.");
    if (currentRegRole === "admin" && adminKey !== ADMIN_SECRET)
      return showAlert("regAlert", "Incorrect admin secret key.");

    const users = getUsers();
    if (users.some(u => u.email.toLowerCase() === email))
      return showAlert("regAlert", "An account with this email already exists.");

    const newUser = {
      id:        Date.now(),
      name,
      email,
      dept:      currentRegRole === "admin" ? "Management" : "Warehouse",
      role:      currentRegRole,
      password:  encodePass(password),
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    saveUsers(users);
    setSession(newUser);

    showAlert("regAlert", "Account created successfully! Redirecting…", "success");
    setTimeout(() => {
      window.location.href = newUser.role === "admin" ? "admin-dashboard.html" : "index.html";
    }, 700);
  });
}

/* ── SIGN OUT (called from index.html nav) ────────────────── */
function doSignOut(e) {
  if (e) e.preventDefault();
  sessionStorage.removeItem(SESSION_KEY);
  window.location.href = "login.html";
}

/* ══════════════════════════════════════════════════════════
   EXCEL / CSV IMPORT
   ══════════════════════════════════════════════════════════ */
const COL_MAP = {
  name:  ["material", "name", "item", "material name"],
  cat:   ["category", "cat", "type"],
  stock: ["stock", "in stock", "qty", "quantity", "on hand"],
  need:  ["need", "needed", "order qty", "required", "order quantity"],
  unit:  ["unit", "uom"],
  price: ["price", "unit price", "cost", "rate"]
};

function normalise(h) { return h.toString().trim().toLowerCase().replace(/\s+/g, " "); }

function detectCols(headers) {
  const hNorm = headers.map(normalise);
  const idx = {};
  for (const [field, aliases] of Object.entries(COL_MAP)) {
    idx[field] = hNorm.findIndex(h => aliases.includes(h));
  }
  return idx;
}

function parseSheet(sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) return { records: [], errors: ["File appears empty."] };

  const headers = rows[0].map(h => h.toString().trim());
  const idx     = detectCols(headers);
  const records = [], errors = [];

  rows.slice(1).forEach((row, i) => {
    if (row.every(c => c === "" || c === null || c === undefined)) return;
    const name  = idx.name  >= 0 ? row[idx.name]  : "";
    const cat   = idx.cat   >= 0 ? row[idx.cat]   : "Uncategorized";
    const stock = idx.stock >= 0 ? parseFloat(row[idx.stock]) : NaN;
    const need  = idx.need  >= 0 ? parseFloat(row[idx.need])  : 0;
    const unit  = idx.unit  >= 0 ? row[idx.unit]  : "pcs";
    const price = idx.price >= 0 ? parseFloat(row[idx.price]) : 0;

    if (!name) { errors.push(`Row ${i + 2}: missing name — skipped.`); return; }
    if (isNaN(stock)) errors.push(`Row ${i + 2}: invalid stock for "${name}".`);

    records.push({
      key:   name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""),
      name:  String(name), cat: String(cat) || "Uncategorized",
      stock: isNaN(stock) ? 0 : stock,
      need:  isNaN(need)  ? 0 : need,
      unit:  String(unit) || "pcs",
      price: isNaN(price) ? 0 : price
    });
  });
  return { records, errors };
}

function renderPreview(containerId, actionsId, { records, errors }) {
  const preview = document.getElementById(containerId);
  const actions = document.getElementById(actionsId);
  if (!preview) return;

  let html = "";
  if (errors.length) {
    html += `<div style="margin-bottom:.6rem;font-size:.82rem;color:var(--bad)">
      <strong>⚠ ${errors.length} warning(s):</strong>
      <ul style="margin:.3rem 0 0 1.2rem;padding:0">${errors.map(x => `<li>${x}</li>`).join("")}</ul>
    </div>`;
  }
  if (records.length) {
    html += `<p style="font-size:.82rem;opacity:.8;margin:0 0 .4rem">${records.length} row(s) ready:</p>
    <table><thead><tr><th>Material</th><th>Cat</th><th>Stock</th><th>Need</th><th>Unit</th><th>₹</th></tr></thead><tbody>
    ${records.slice(0, 8).map(r => `<tr><td>${r.name}</td><td>${r.cat}</td><td>${r.stock}</td><td>${r.need}</td><td>${r.unit}</td><td>${r.price || "—"}</td></tr>`).join("")}
    ${records.length > 8 ? `<tr><td colspan="6" style="opacity:.5;text-align:center">… ${records.length - 8} more rows</td></tr>` : ""}
    </tbody></table>`;
  }

  preview.innerHTML = html;
  preview.hidden = !html;
  if (actions) actions.style.display = records.length ? "flex" : "none";
}

function handleFile(file, previewId, actionsId) {
  if (!file) return;
  if (!["xlsx", "xls", "csv"].includes(file.name.split(".").pop().toLowerCase()))
    return toast("Use .xlsx, .xls, or .csv files only.");
  if (typeof XLSX === "undefined")
    return toast("Excel library not loaded — reload the page.");

  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const wb     = XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
      const parsed = parseSheet(wb.Sheets[wb.SheetNames[0]]);
      window._importedData = parsed.records;
      renderPreview(previewId, actionsId, parsed);
      toast(`Parsed ${parsed.records.length} row(s) from "${file.name}"`);
    } catch (err) {
      toast("Could not read file: " + err.message);
    }
  };
  reader.readAsArrayBuffer(file);
}

/* ---- Wire up login page import ---- */
(function initLoginImport() {
  const dz   = document.getElementById("dropZone");
  const file = document.getElementById("importFile");
  if (!dz || !file) return;

  file.addEventListener("change", () => handleFile(file.files[0], "importPreview", "importActions"));
  dz.addEventListener("dragover",  e => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", ()  => dz.classList.remove("over"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("over");
    handleFile(e.dataTransfer.files[0], "importPreview", "importActions");
  });

  document.getElementById("loadDataBtn")?.addEventListener("click", () => {
    if (!window._importedData?.length) return toast("No data to load.");
    localStorage.setItem("ss_inventory_import", JSON.stringify(window._importedData));
    toast("Data loaded! Going to inventory…");
    setTimeout(() => { window.location.href = "index.html"; }, 1000);
  });

  document.getElementById("clearImportBtn")?.addEventListener("click", () => {
    window._importedData = null; file.value = "";
    const p = document.getElementById("importPreview");
    if (p) { p.innerHTML = ""; p.hidden = true; }
    const a = document.getElementById("importActions");
    if (a) a.style.display = "none";
  });
})();

/* ---- Wire up admin dashboard import ---- */
(function initAdminImport() {
  const dz   = document.getElementById("dropZoneAdmin");
  const file = document.getElementById("importFileAdmin");
  if (!dz || !file) return;

  file.addEventListener("change", () => handleFile(file.files[0], "importPreviewAdmin", "importActionsAdmin"));
  dz.addEventListener("dragover",  e => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", e => {
    e.preventDefault(); dz.classList.remove("over");
    handleFile(e.dataTransfer.files[0], "importPreviewAdmin", "importActionsAdmin");
  });

  document.getElementById("applyImportBtn")?.addEventListener("click", () => {
    if (!window._importedData?.length) return toast("No data to apply.");
    localStorage.setItem("ss_inventory_import", JSON.stringify(window._importedData));
    toast("✅ Inventory updated for all users!");
  });

  document.getElementById("clearImportAdminBtn")?.addEventListener("click", () => {
    window._importedData = null; file.value = "";
    const p = document.getElementById("importPreviewAdmin");
    if (p) { p.innerHTML = ""; p.hidden = true; }
    const a = document.getElementById("importActionsAdmin");
    if (a) a.style.display = "none";
  });
})();
