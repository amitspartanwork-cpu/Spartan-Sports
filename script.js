const $ = s => document.querySelector(s);
const fmt = n => +n.toFixed(2);

/* Rebuild byKey lookup after M is replaced */
function byKey_refresh() {
  Object.keys(byKey).forEach(k => delete byKey[k]);
  M.forEach(m => { byKey[m.key] = m; });
  // Rebuild category filter
  const cat = $("#cat");
  if (cat) {
    cat.innerHTML = '<option value="">All categories</option>';
    [...new Set(M.map(m => m.cat))].forEach(c => cat.insertAdjacentHTML("beforeend", `<option>${c}</option>`));
  }
  // Rebuild product planner
  const prod = $("#prod");
  if (prod) {
    prod.innerHTML = "";
    Object.entries(P).forEach(([k, p]) => prod.insertAdjacentHTML("beforeend", `<option value="${k}">${p.name}</option>`));
  }
}

function updateKPIs() {
  const short = M.filter(m => m.stock < m.need);
  if ($("#kTotal")) $("#kTotal").textContent = M.length;
  if ($("#kShort")) $("#kShort").textContent = short.length;
  if ($("#kValue")) $("#kValue").textContent = M.reduce((s, m) => s + m.stock * m.price, 0).toLocaleString("en-IN");
}

function updateOrders() {
  const short = M.filter(m => m.stock < m.need);
  if ($("#ordBody")) $("#ordBody").innerHTML = short.map(m => `<tr><td>${m.name}</td><td>${m.need - m.stock} ${m.unit}</td><td>₹${((m.need - m.stock) * m.price).toLocaleString("en-IN")}</td></tr>`).join("");
  if ($("#ordEmpty")) $("#ordEmpty").hidden = short.length > 0;
  const total = short.reduce((s, m) => s + (m.need - m.stock) * m.price, 0);
  if ($("#ordTotal")) $("#ordTotal").textContent = short.length ? `Estimated total: ₹${total.toLocaleString("en-IN")}` : "";
}

/* Stock = what is in the warehouse. need = required for open orders. */
const M = [
  { key: "leather", name: "Cowhide leather", cat: "Leather", stock: 120, need: 90, unit: "sq m", price: 850 },
  { key: "rubber", name: "Natural rubber", cat: "Rubber", stock: 40, need: 55, unit: "kg", price: 210 },
  { key: "willow", name: "English willow clefts", cat: "Wood", stock: 18, need: 25, unit: "pcs", price: 3200 },
  { key: "ash", name: "Ash wood billets", cat: "Wood", stock: 60, need: 40, unit: "pcs", price: 650 },
  { key: "steel", name: "Stainless steel wire", cat: "Metal", stock: 300, need: 200, unit: "m", price: 45 },
  { key: "mesh", name: "Polyester mesh", cat: "Fabric", stock: 9, need: 8, unit: "rolls", price: 1200 }
];
const byKey = Object.fromEntries(M.map(m => [m.key, m])); // mutable — refreshed by byKey_refresh()

/* Materials used per single product */
const P = {
  bat: { name: "Cricket bat", use: { willow: 1, rubber: 0.2 } },
  ball: { name: "Football", use: { leather: 0.5, rubber: 0.3 } },
  hockey: { name: "Hockey stick", use: { ash: 1, rubber: 0.1 } },
  net: { name: "Goal net", use: { mesh: 0.5, steel: 6 } },
  glove: { name: "Boxing glove", use: { leather: 0.3, rubber: 0.15 } }
};

const status = m => m.stock < m.need ? "short" : m.stock < m.need * 1.25 ? "tight" : "ok";
const LABEL = { short: "Short", tight: "Tight", ok: "Enough" };
const state = { status: "" };

function toast(t) { const el = $("#toast"); el.textContent = t; el.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 2200); }

/* ---------- Inventory cards ---------- */
function render() {
  const q = $("#q").value.toLowerCase(), c = $("#cat").value, s = state.status;
  const list = M.filter(m => m.name.toLowerCase().includes(q) && (!c || m.cat === c) && (!s || status(m) === s));
  $("#grid").innerHTML = list.map(m => {
    const st = status(m), pct = Math.min(100, m.stock / (m.need * 1.5) * 100);
    return `<article class="card ${st}">
      <h3>${m.name}</h3><p class="cat">${m.cat}</p>
      <div class="big">${m.stock} <small>${m.unit}</small></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <p class="meta">Needed for open orders: ${m.need} ${m.unit}</p>
      <span class="pill ${st}">${LABEL[st]}${st === "short" ? " by " + (m.need - m.stock) + " " + m.unit : ""}</span></article>`;
  }).join("");
  $("#empty").hidden = list.length > 0;
  tilt();
}

/* 3D tilt on cards that follows the pointer */
function tilt() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  document.querySelectorAll(".card").forEach(card => {
    card.onpointermove = e => {
      const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      card.style.transform = `rotateY(${x * 18}deg) rotateX(${-y * 18}deg) translateZ(10px)`;
    };
    card.onpointerleave = () => card.style.transform = "";
  });
}

/* ---------- Filters ---------- */
[...new Set(M.map(m => m.cat))].forEach(c => $("#cat").insertAdjacentHTML("beforeend", `<option>${c}</option>`));
$("#q").oninput = render; $("#cat").onchange = render;
$("#chips").onclick = e => {
  if (!e.target.dataset.hasOwnProperty("s")) return;
  state.status = e.target.dataset.s;
  document.querySelectorAll(".chip").forEach(b => b.classList.toggle("on", b === e.target));
  render();
};

/* ---------- Production check ---------- */
Object.entries(P).forEach(([k, p]) => $("#prod").insertAdjacentHTML("beforeend", `<option value="${k}">${p.name}</option>`));
function plan() {
  const p = P[$("#prod").value], n = Math.max(1, parseInt($("#qty").value) || 1);
  let can = Infinity, rows = "";
  for (const k in p.use) {
    const m = byKey[k], need = p.use[k] * n;
    can = Math.min(can, Math.floor(m.stock / p.use[k]));
    rows += `<tr><td>${m.name}</td><td>${fmt(need)} ${m.unit}</td><td>${m.stock} ${m.unit}</td>
      <td class="${need <= m.stock ? "okc" : "shortc"}">${need <= m.stock ? "Enough" : "Short by " + fmt(need - m.stock) + " " + m.unit}</td></tr>`;
  }
  $("#planBody").innerHTML = rows;
  const v = $("#verdict"), ok = can >= n;
  v.textContent = ok ? `Enough stock to make ${n} × ${p.name}.` : `Stock covers ${can} of ${n} × ${p.name}. Order the shortfall.`;
  v.className = "verdict " + (ok ? "ok" : "short");
}
$("#prod").onchange = plan; $("#qty").oninput = plan;

/* ---------- Materials required (order list) ---------- */
const short = M.filter(m => m.stock < m.need);
$("#ordBody").innerHTML = short.map(m => `<tr><td>${m.name}</td><td>${m.need - m.stock} ${m.unit}</td><td>₹${((m.need - m.stock) * m.price).toLocaleString("en-IN")}</td></tr>`).join("");
$("#ordEmpty").hidden = short.length > 0;
const total = short.reduce((s, m) => s + (m.need - m.stock) * m.price, 0);
$("#ordTotal").textContent = short.length ? `Estimated total: ₹${total.toLocaleString("en-IN")}` : "";
$("#excelBtn").onclick = () => {
  if (typeof XLSX === "undefined") {
    console.error("Excel workbook library did not load.");
    toast("Excel export unavailable. Reload the page and try again.");
    return;
  }
  const rows = [
    ["Material", "Category", "In stock", "Needed for open orders", "Unit", "Status", "Order quantity", "Unit price (₹)", "Estimated order cost (₹)"],
    ...M.map(m => {
      const orderQty = Math.max(0, m.need - m.stock);
      return [m.name, m.cat, m.stock, m.need, m.unit, LABEL[status(m)], orderQty, m.price, orderQty * m.price];
    })
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 25 }, { wch: 16 }, { wch: 12 }, { wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 16 }, { wch: 24 }];
  worksheet["!autofilter"] = { ref: worksheet["!ref"] };
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
  try {
    XLSX.writeFile(workbook, "spartan-sports-inventory.xlsx", { compression: true });
    toast("Excel workbook downloaded");
  } catch (error) {
    console.error("Excel workbook export failed:", error);
    toast("Excel export failed. Please try again.");
  }
};
$("#copyBtn").onclick = () => {
  if (!short.length) return toast("Nothing to order");
  const text = "Spartan Sports order list\n" + short.map(m => `- ${m.name}: ${m.need - m.stock} ${m.unit}`).join("\n");
  (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast("Order list copied"), () => toast("Copy failed. Select the table instead."));
};

/* ---------- Hero KPIs ---------- */
$("#kTotal").textContent = M.length;
$("#kShort").textContent = short.length;
$("#kValue").textContent = M.reduce((s, m) => s + m.stock * m.price, 0).toLocaleString("en-IN");

/* ---------- 3D crates ---------- */
const cats = ["Leather", "Rubber", "Wood"];
$("#cubes").innerHTML = cats.map(c => {
  const items = M.filter(m => m.cat === c), n = items.filter(m => m.stock < m.need).length;
  const side = `${c}<small>${n ? n + " short" : "All enough"}</small>`;
  return `<div class="cube ${n ? "bad" : "good"}" data-cat="${c}">
    ${[0, 1, 2, 3].map(i => `<div class="face f${i}">${i % 2 ? side : c + "<small>" + items.length + " material" + (items.length > 1 ? "s" : "") + "</small>"}</div>`).join("")}
    <div class="face f4"></div><div class="face f5"></div></div>`;
}).join("");

const cubes = [...document.querySelectorAll(".cube")];
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
let ry = -25, rx = -18, drag = null;
(function loop() {
  if (!drag && !still) ry += 0.3;
  cubes.forEach((c, i) => c.style.transform = `rotateX(${rx}deg) rotateY(${ry + i * 30}deg)`);
  requestAnimationFrame(loop);
})();
$("#stage").addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, moved: 0, cube: e.target.closest(".cube") }; });
addEventListener("pointermove", e => {
  if (!drag) return;
  const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
  drag.moved += Math.abs(dx) + Math.abs(dy);
  ry += dx * 0.6; rx = Math.max(-60, Math.min(30, rx - dy * 0.4));
  drag.x = e.clientX; drag.y = e.clientY;
});
addEventListener("pointerup", () => {
  if (drag && drag.moved < 6 && drag.cube) {
    $("#cat").value = drag.cube.dataset.cat; render();
    $("#inventory").scrollIntoView({ behavior: "smooth" }); toast("Showing " + drag.cube.dataset.cat);
  }
  drag = null;
});

render(); plan();
