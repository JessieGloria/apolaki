/* Apolaki — stock, sales and accounts for Apolaki by Jason Labunda.
   Plain JavaScript, no build step. Data lives in Supabase. */
(() => {
const cfg = window.APOLAKI_CONFIG || {};
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

const state = {
  user: null, tab: "home",
  products: [], locations: [], stock: [],
  sellAt: localGet("sellAt", null), sellCat: localGet("sellCat", "all"), cart: {}, custom: [], finalPrice: null, pop: localGet("pop", {}), payment: "Cash", discount: 0,
  stockLoc: "all", search: "", codes: [], openCats: new Set()
};

const CATEGORIES = ["Raw Material","Packaging","Tools","Equipment","Postage","Office Supplies","Market Fee","Workshop Rent","Salary","Transport","Other"];
const GROUPS = ["Cost of Goods Sold","Operating Expenses","Employee","Equipment"];
const PAYMENTS = ["Cash","QR","Card","Transfer"];
const ICONS = {
  in: '<path d="M12 3v18M17 7.5c0-1.9-2.2-3-5-3s-5 1.1-5 3 2.2 2.6 5 3.2 5 1.4 5 3.3-2.2 3.3-5 3.3-5-1.2-5-3.1"/>',
  out: '<path d="M4 7h16v11H4zM4 11h16M8 15h3"/>',
  left: '<path d="M4 17l5-5 4 4 7-8M15 8h5v5"/>',
  shop: '<path d="M4 20V9l8-5 8 5v11M9 20v-6h6v6"/>',
  box: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>',
  tent: '<path d="M3 20 12 4l9 16zM12 4v16M8 20l4-6 4 6"/>',
  warn: '<path d="M12 4 2.5 20h19zM12 10v4M12 17v.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  tool: '<path d="M14 6a4 4 0 0 0 5 5l-8 8a2 2 0 0 1-3-3z"/>'
};
const ico = (name, color, lg) => `<span class="ico${lg ? " lg" : ""}" style="background:${color}"><svg viewBox="0 0 24 24">${ICONS[name]}</svg></span>`;
const CHEV = '<svg class="chev" viewBox="0 0 8 13"><path d="M1.5 1.5 6.5 6.5 1.5 11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SKEL = '<div class="skeleton"></div><div class="skeleton" style="height:64px"></div><div class="skeleton" style="height:64px"></div>';
const COLORS = ["var(--blue)","var(--orange)","var(--purple)","var(--pink)","var(--green)","var(--teal)","var(--yellow)","var(--indigo)","var(--red)","var(--green)","var(--orange)","var(--blue)"];

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const RM = n => { const v = Number(n || 0); return (v < -0.004 ? "−RM" : "RM") + Math.abs(v).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const pad = n => String(n).padStart(2, "0");
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ym = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthStart = s => { const [y, m] = s.split("-").map(Number); return new Date(y, m - 1, 1); };
const nextMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 1);
const monthLabel = s => monthStart(s).toLocaleDateString("en-MY", { month: "long", year: "numeric" });
const shortDate = s => new Date(s.length === 10 ? s + "T00:00" : s).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2));
function localGet(k, d) { try { const v = localStorage.getItem("apolaki:" + k); return v === null ? d : JSON.parse(v); } catch { return d; } }
function localSet(k, v) { try { localStorage.setItem("apolaki:" + k, JSON.stringify(v)); } catch {} }

function toast(msg, action) {
  const t = $("#toast"); t.textContent = msg; t.classList.toggle("has-action", !!action);
  if (action) { const b = document.createElement("button"); b.type = "button"; b.textContent = action.label; b.onclick = () => { t.classList.remove("show"); clearTimeout(toast.t); action.run(); }; t.append(" ", b); }
  t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), action ? 7000 : 2600);
}
/* data entry opens as its own page (slides in from the right); Back returns to the previous page */
let sheetTimer, pageStack = [];
function showPage(entry) {
  const body = $("#sheetBody");
  body.innerHTML = entry.html;
  $("#sheet .sheet-card").scrollTop = 0;
  if (entry.bind) entry.bind(body);
}
function openSheet(html, bind) {
  clearTimeout(sheetTimer);
  const sh = $("#sheet");
  const title = (html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/) || [])[1] || "";
  const entry = { html, bind, title };
  const at = sh.hidden ? -1 : pageStack.findIndex(p => p.title === title);
  if (at >= 0) pageStack.splice(at, pageStack.length - at, entry); /* same page refreshed, or back to an earlier one */
  else pageStack.push(entry);
  const fresh = sh.hidden;
  if (fresh) { sh.hidden = false; sh.getBoundingClientRect(); }
  else { const c = $("#sheet .sheet-card"); c.classList.remove("swap"); void c.offsetWidth; c.classList.add("swap"); }
  sh.classList.add("open"); document.body.classList.add("locked");
  showPage(entry);
}
function closeSheet() {
  pageStack = [];
  const sh = $("#sheet"); sh.classList.remove("open"); document.body.classList.remove("locked");
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { sh.hidden = true; $("#sheetBody").innerHTML = ""; }, 340);
}
function pageBack() {
  if (pageStack.length > 1) { pageStack.pop(); const c = $("#sheet .sheet-card"); c.classList.remove("swap"); void c.offsetWidth; c.classList.add("swap-back"); setTimeout(() => c.classList.remove("swap-back"), 400); showPage(pageStack[pageStack.length - 1]); }
  else closeSheet();
}
$("#sheetBack").addEventListener("click", pageBack);
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) pageBack(); });

/* no double saves: while a button's (or form's) save is still running, more taps do nothing */
function runLocked(el, handler, e) {
  e.stopImmediatePropagation(); e.preventDefault();
  if (el.dataset.busy) return;
  const btn = el.tagName === "FORM" ? el.querySelector("button:not([type=button])") : el;
  const ev = new Proxy(e, { get: (t, k) => k === "currentTarget" ? el : typeof t[k] === "function" ? t[k].bind(t) : t[k] });
  let r;
  try { r = handler.call(el, ev); } catch (err) { return fail(err); }
  if (!r || typeof r.then !== "function") return;
  el.dataset.busy = "1"; if (btn) { btn.dataset.busy = "1"; btn.disabled = true; }
  const done = () => { delete el.dataset.busy; if (btn) { delete btn.dataset.busy; btn.disabled = false; } };
  r.then(done, err => { done(); fail(err); });
}
document.addEventListener("click", e => {
  const b = e.target.closest && e.target.closest("button");
  if (b && typeof b.onclick === "function") runLocked(b, b.onclick, e);
}, true);
document.addEventListener("submit", e => {
  const f = e.target;
  if (f && typeof f.onsubmit === "function") runLocked(f, f.onsubmit, e);
}, true);

const prod = sku => state.products.find(p => p.sku === sku);
const loc = id => state.locations.find(l => l.id === Number(id));
const workshop = () => state.locations.find(l => l.type === "workshop");
const retailers = () => state.locations.filter(l => l.type === "retailer");
const activeProducts = () => state.products.filter(p => p.status === "Active");
/* markets: "upcoming" until their first day, then open until ended */
const isUpcoming = m => !!(m && m.type === "market" && m.active && !m.cancelled_on && m.start_date && m.start_date > ymd(new Date()));
/* booth fee: what's agreed, what's paid (deposit + balance − refunds), and what that means */
const feePays = m => (state.mktPays || []).filter(e => e.location_id === m.id).sort((a, b) => a.spent_on.localeCompare(b.spent_on));
function feeStatus(m) {
  const paid = round2(feePays(m).reduce((t, e) => t + Number(e.amount), 0)), total = m.fee != null ? Number(m.fee) : null;
  const left = total != null ? round2(Math.max(0, total - paid)) : 0;
  if (m.cancelled_on) return { key: "cancelled", paid, total, left: 0, confirmed: false, label: paid > 0.004 ? `Cancelled · ${RM(paid)} not refunded` : "Cancelled", color: "rust" };
  if (!total) return { key: "nofee", paid, total, left, confirmed: true, label: paid > 0 ? `Booth fee ${RM(paid)} paid` : "No booth fee set", color: "" };
  if (paid <= 0.004) return { key: "unpaid", paid, total, left, confirmed: false, label: `Not paid yet · booth fee ${RM(total)}${m.fee_due_on ? `, due ${shortDate(m.fee_due_on)}` : ""}`, color: "peach" };
  if (left > 0.004) return { key: "deposit", paid, total, left, confirmed: true, label: `Confirmed · deposit ${RM(paid)} paid, ${RM(left)} left${m.fee_due_on ? ` (due ${shortDate(m.fee_due_on)})` : ""}`, color: "green" };
  return { key: "paid", paid, total, left: 0, confirmed: true, label: "Confirmed · booth fee fully paid", color: "green" };
}
const feeDesc = (m, kind) => `${m.name}${kind ? ` – ${kind}` : ""}`;
const openMarkets = () => state.locations.filter(l => l.type === "market" && l.active && !isUpcoming(l));
const upcomingMarkets = () => state.locations.filter(isUpcoming).sort((a, b) => a.start_date.localeCompare(b.start_date));
const marketDates = m => !m.start_date ? "Dates not set" : !m.end_date || m.end_date === m.start_date ? shortDate(m.start_date) : `${shortDate(m.start_date)} – ${shortDate(m.end_date)}`;
/* retailer codes: each shop's own item code (Art Attic = APO numbers). Only shown on retailer pages. */
const codeAt = (locId, sku) => state.codes.find(c => c.location_id === Number(locId) && c.sku === sku)?.code || null;
/* a shop may use one code for all sizes of a design; then several items share that code (smallest size first) */
const sizeRank = sku => { const i = SIZE_ORDER.indexOf(sizeShort(prod(sku)?.size)); return i < 0 ? 99 : i; };
const skusForCode = (locId, code) => state.codes.filter(c => c.location_id === Number(locId) && c.code && c.code.toUpperCase() === String(code).toUpperCase() && prod(c.sku)).map(c => c.sku).sort((a, b) => sizeRank(a) - sizeRank(b));
const skuForCode = (locId, code) => skusForCode(locId, code)[0] || null;
const codeRow = (locId, sku) => state.codes.find(c => c.location_id === Number(locId) && c.sku === sku);
const sharedSkus = (locId, sku) => {
  if (codeRow(locId, sku)?.sizes_together) { const s = designSkus(sku).filter(x => codeRow(locId, x)?.sizes_together); return s.length > 1 ? s : [sku]; }   /* shop doesn't separate sizes */
  const c = codeAt(locId, sku); const s = c ? skusForCode(locId, c) : []; return s.length > 1 ? s : [sku];
};
const sharedKey = (locId, sku) => { const s = sharedSkus(locId, sku); return s.length > 1 ? "g:" + s[0] : sku; };
/* shops that have no item codes of their own: code prompts are hidden */
const usesCodes = r => r && r.uses_codes !== false;
/* sizes of the same design as this item (smallest first) */
const designSkus = sku => { const p = prod(sku); if (!p || !sizeShort(p.size)) return [sku]; const k = (p.family || "") + "|" + baseName(p.name).toLowerCase();
  return state.products.filter(x => sizeShort(x.size) && (x.family || "") + "|" + baseName(x.name).toLowerCase() === k).map(x => x.sku).sort((a, b) => sizeRank(a) - sizeRank(b)); };
/* pieces reported under a shared code: take from the size with the most stock at that shop first, never below zero */
function splitShared(skus, qty, have) {
  const left = { ...have }, out = {};
  for (let i = 0; i < qty; i++) { const pick = skus.slice().sort((a, b) => (left[b] || 0) - (left[a] || 0))[0]; const s = (left[pick] || 0) > 0 ? pick : skus[0]; out[s] = (out[s] || 0) + 1; left[s] = (left[s] || 0) - 1; }
  return out;
}
/* shop price: the retailer's own price for an item, falling back to the original price */
const shopPrice = (locId, sku) => { const c = state.codes.find(x => x.location_id === Number(locId) && x.sku === sku); return c && c.price != null ? Number(c.price) : Number(prod(sku)?.retail_price || 0); };
const CAT_ORDER = ["Bracelet", "Earrings", "Ring", "Neck Piece"];
const CAT_PLURAL = { Bracelet: "Bracelets", Earrings: "Earrings", Ring: "Rings", "Neck Piece": "Neck pieces" };
const CAT_G = { Bracelet: "n-charcoal", Earrings: "n-stone", Ring: "n-cream", "Neck Piece": "n-taupe" };
const catG = c => CAT_G[c] || ["n-taupe", "n-stone", "n-charcoal"][String(c || "").length % 3];
/* small jewellery icons for each category */
const CAT_SVG = {
  Bracelet: '<ellipse cx="12" cy="12" rx="8.5" ry="6"/><ellipse cx="12" cy="12" rx="5.5" ry="3.6"/>',
  Earrings: '<path d="M12 2.8a2.6 2.6 0 0 1 2.6 2.6c0 1.6-2.6 2-2.6 4.2"/><path d="M12 9.6 8.4 15.4a3.6 3.6 0 1 0 7.2 0z"/>',
  Ring: '<circle cx="12" cy="14.6" r="6"/><path d="M9.6 6.2 12 3.2l2.4 3-2.4 2.4z"/>',
  "Neck Piece": '<path d="M4 3.5c0 6.5 3.6 10.5 8 10.5s8-4 8-10.5"/><path d="M12 14v1.6"/><path d="m12 15.6-2.2 3 2.2 2.4 2.2-2.4z"/>',
  Other: '<path d="M6.5 4h11l3.5 5-9 11L3 9z"/><path d="M3 9h18M9 4l3 16 3-16"/>'
};
/* no jewellery icons: categories are told apart by colour only */
const catSvg = c => "";
const catIco = c => `<span class="cat-bar ${catG(c)}"></span>`;
function groupByCategory(ps) {
  const g = {}; ps.forEach(p => (g[p.category || "Other"] = g[p.category || "Other"] || []).push(p));
  return Object.entries(g).sort((a, b) => ((CAT_ORDER.indexOf(a[0]) + 1) || 99) - ((CAT_ORDER.indexOf(b[0]) + 1) || 99) || a[0].localeCompare(b[0]))
    .map(([k, v]) => [k, v.sort((x, y) => x.name.localeCompare(y.name))]);
}
const itemSub = p => [p.category, p.size && p.size !== "Free" ? p.size : null].filter(Boolean).join(" · ");
/* earrings are counted in pairs: 1 in stock = 1 pair */
const isPair = p => /earring/i.test((p && p.category) || "");
const unitWord = (p, n) => isPair(p) ? (n === 1 ? "pair" : "pairs") : (n === 1 ? "piece" : "pieces");
const units = (p, n) => `${n} ${unitWord(p, n)}`;
/* a mixed count, e.g. "5 pieces + 3 pairs of earrings" */
function countWords(list /* [{p, qty}] */) {
  const e = list.filter(x => isPair(x.p)).reduce((t, x) => t + x.qty, 0), o = list.filter(x => !isPair(x.p)).reduce((t, x) => t + x.qty, 0);
  return [o ? `${o} piece${o === 1 ? "" : "s"}` : "", e ? `${e} pair${e === 1 ? "" : "s"} of earrings` : ""].filter(Boolean).join(" + ") || "0 pieces";
}
const initials = name => String(name || "?").replace(/\(.*?\)/g, "").split(/\s+/).filter(w => /[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join("");
const newKey = (list = state.products) => "ITM" + String(Math.max(0, ...list.filter(x => /^ITM\d+$/.test(x.sku)).map(x => parseInt(x.sku.slice(3), 10))) + 1).padStart(4, "0");
/* item photos: old ones are copies of the Drive photos kept inside the app (photos/<id>.jpg);
   new ones are taken in the app and stored in Supabase (full link). Both load on any phone, signed in to Google or not. */
const photo = p => !p || !p.photo ? null : /^https?:/.test(p.photo) ? p.photo : `photos/${encodeURIComponent(p.photo)}.jpg`;
/* shrink a picked photo to an 800px square JPEG before uploading (fast on market signal) */
function squareJpeg(file, size = 800) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement("canvas");
      c.width = c.height = size;
      c.getContext("2d").drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      c.toBlob(b => b ? resolve(b) : reject(new Error("Couldn't read that photo")), "image/jpeg", 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo")); };
    img.src = url;
  });
}
async function uploadPhoto(file) {
  const blob = await squareJpeg(file);
  const path = `items/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await sb.storage.from("product-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return sb.storage.from("product-photos").getPublicUrl(path).data.publicUrl;
}

/* stock = server levels minus sales still waiting in the outbox */
function stockAt(locId, sku) {
  let q = 0;
  for (const s of state.stock) if (s.sku === sku && (locId === "all" || s.location_id === Number(locId))) q += s.qty;
  for (const r of outbox()) if (r.sku === sku && (locId === "all" || r.location_id === Number(locId))) q -= r.qty;
  return q;
}
const stockTotalAt = locId => state.products.reduce((t, p) => t + Math.max(0, stockAt(locId, p.sku)), 0);

/* reads of sales and expenses skip soft-deleted entries; "deleting" only marks them, so they can be restored */
const live = (table, cols) => sb.from(table).select(cols).is("deleted_at", null);
async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
function fail(e) { console.error(e); toast(e.message ? "Couldn't save: " + e.message : "Something went wrong. Check your connection."); }

/* ---------- offline outbox for sales ---------- */
const outbox = () => localGet("outbox", []);
function setOutbox(v) { localSet("outbox", v); updateBadge(); }
function updateBadge() {
  const b = $("#syncBadge"), n = outbox().length, on = navigator.onLine;
  /* only shows when there's something to know: sales waiting on the phone, or no internet */
  if (!state.user || (!n && on)) { b.hidden = true; return; }
  b.hidden = false;
  b.classList.toggle("pending", n > 0);
  b.title = n ? `${n} sale line${n > 1 ? "s" : ""} saved on this phone, waiting to send. Tap to send now.` : "No internet. You can keep selling; sales send when you're back online.";
  b.innerHTML = (on ? '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18"/><path d="M12 12v7M9 15l3-3 3 3"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18H7z"/><path d="M4 4l16 16"/></svg>') + (n ? `<b>${n}</b>` : "");
}
let syncing = false;
async function sync() {
  if (syncing || !navigator.onLine || !state.user) return updateBadge();
  const rows = outbox(); if (!rows.length) return updateBadge();
  syncing = true;
  try {
    const { error } = await sb.from("sales").upsert(rows, { onConflict: "client_id", ignoreDuplicates: true });
    if (error) throw error;
    const sent = new Set(rows.map(r => r.client_id));
    setOutbox(outbox().filter(r => !sent.has(r.client_id)));
    await loadStock();
    if (state.tab === "market" && !state.editPrice) { state.todayJson = null; render(); }
  } catch (e) { console.warn("sync later", e); }
  syncing = false; updateBadge();
}
$("#syncBadge").addEventListener("click", () => { toast($("#syncBadge").title); sync(); });
window.addEventListener("online", sync);
window.addEventListener("offline", updateBadge);
setInterval(sync, 20000);

/* ---------- data ---------- */
async function loadAll() {
  try {
    const [p, l, c, mp] = await Promise.all([
      q(live("products", "*").order("name")),
      q(live("locations", "*").order("id")),
      q(sb.from("retailer_codes").select("*")),
      loadMktPays(true)
    ]);
    state.products = p; state.locations = l; state.codes = c;
    localSet("products", p); localSet("locations", l); localSet("codes", c);
    await loadStock();
  } catch (e) {
    state.products = localGet("products", []); state.locations = localGet("locations", []); state.stock = localGet("stock", []); state.codes = localGet("codes", []); state.mktPays = localGet("mktPays", []);
    toast("Offline. Showing the last saved copy.");
  }
}
/* booth fee payments (deposit, balance, refunds) linked to each market */
async function loadMktPays(quiet) {
  try { state.mktPays = await q(live("expenses", "id,spent_on,amount,description,location_id").not("location_id", "is", null)); localSet("mktPays", state.mktPays); }
  catch (e) { state.mktPays = localGet("mktPays", []); if (!quiet) throw e; }
  return state.mktPays;
}
async function loadStock() {
  try { state.stock = await q(sb.from("stock_levels").select("*")); localSet("stock", state.stock); }
  catch { state.stock = localGet("stock", []); }
}

/* ---------- auth ---------- */
function renderLogin(msg) {
  $("#tabs").hidden = true; $("#top").hidden = true;
  $("#view").innerHTML = `
  <div class="login">
    <div class="mark"><img src="icon.svg" alt="Apolaki" width="64" height="64"></div>
    <h1>Welcome<br>back!</h1>
    <p class="muted">One piece, one sale, one market at a time.</p>
    ${msg ? `<p class="tag rust" style="margin-bottom:10px">${esc(msg)}</p>` : ""}
    <form id="loginForm">
      <label class="field"><span>Email</span><input name="email" type="email" placeholder="Email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" placeholder="Password" autocomplete="current-password" required></label>
      <button class="btn primary block" type="submit">Sign in</button>
    </form>
  </div>`;
  $("#loginForm").onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await sb.auth.signInWithPassword({ email: f.get("email").trim(), password: f.get("password") });
    if (error) renderLogin("That email and password don't match. Try again.");
  };
}
async function start(session) {
  state.user = session ? session.user : null;
  if (!state.user) { updateBadge(); return renderLogin(); }
  if (navigator.onLine) {
    const { data, error } = await sb.from("allowed_users").select("email");
    if (!error && (!data || !data.length)) {
      $("#tabs").hidden = true;
      $("#view").innerHTML = `<div class="login"><h1>Not approved yet</h1><p class="muted">${esc(state.user.email)} isn't on the Apolaki access list. Ask the owner to add it, then sign in again.</p><button class="btn block" id="out">Sign out</button></div>`;
      $("#out").onclick = () => sb.auth.signOut();
      return;
    }
  }
  $("#tabs").hidden = false; $("#top").hidden = false;
  try { const { data: me } = await sb.from("allowed_users").select("display_name").eq("email", state.user.email).maybeSingle(); state.name = me && me.display_name ? me.display_name.split(" ")[0] : null; } catch {}
  await loadAll(); updateBadge(); sync(); render();
  const opened = new URLSearchParams(location.search).get("open");
  if (opened) { history.replaceState(null, "", location.pathname); openFromNotification(opened); }
}
sb.auth.onAuthStateChange((evt, session) => {
  if (evt === "SIGNED_IN" && !state.user) start(session);
  if (evt === "SIGNED_OUT") { state.user = null; start(null); }
});
sb.auth.getSession().then(({ data }) => start(data.session));

/* ---------- navigation ---------- */
const TAB_ORDER = ["home", "market", "retailers", "retailer", "stock", "accounts"];
let animTimer;
function go(tab) {
  const from = TAB_ORDER.indexOf(state.tab), to = TAB_ORDER.indexOf(tab);
  const v = $("#view");
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  state.tab = tab;
  v.style.minHeight = "";
  window.scrollTo({ top: 0, behavior: "instant" });
  v.classList.remove("slide-r", "slide-l", "anim"); void v.offsetWidth;
  v.classList.add(to >= from ? "slide-r" : "slide-l", "anim");
  clearTimeout(animTimer); animTimer = setTimeout(() => v.classList.remove("anim", "slide-r", "slide-l"), 700);
  paint();
}
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => go(b.dataset.tab));
/* refresh the current screen in place: keep the scroll position and don't replay animations */
let holdTimer;
function render() {
  const v = $("#view");
  if (!v.classList.contains("anim")) { v.style.minHeight = v.offsetHeight + "px"; clearTimeout(holdTimer); holdTimer = setTimeout(() => v.style.minHeight = "", 1500); }
  paint();
}
function paint() {
  document.body.classList.remove("has-cart");
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === (state.tab === "retailer" ? "retailers" : state.tab) ? "page" : "false"));
  ({ home: renderHome, market: renderSell, retailers: renderRetailers, retailer: renderRetailer, stock: renderStock, accounts: renderAccounts })[state.tab]();
}

/* =========================================================
   HOME
   ========================================================= */
/* Apolaki account = opening balance + money in (markets, online, other sales, shop payouts received) − expenses, from the opening date.
   Same sum as the BUSINESS ACCOUNT box in the Account Tracker sheet. */
async function fetchBalance() {
  const [st] = await q(sb.from("app_settings").select("value").eq("key", "opening_balance"));
  const ob = st?.value || { amount: 0, date: "2026-01-01" };
  const [sales, pays, exps] = await Promise.all([
    q(live("sales", "amount").neq("channel", "retailer").gte("sold_at", new Date(ob.date + "T00:00").toISOString())),
    q(sb.from("payouts").select("paid_amount,net_amount").eq("paid", true).gte("paid_on", ob.date)),
    q(live("expenses", "amount").gte("spent_on", ob.date))
  ]);
  const moneyIn = round2(sales.reduce((t, x) => t + Number(x.amount), 0) + pays.reduce((t, p) => t + Number(p.paid_amount ?? p.net_amount), 0));
  const out = round2(exps.reduce((t, x) => t + Number(x.amount), 0));
  return { opening: Number(ob.amount) || 0, date: ob.date, moneyIn, out, balance: round2((Number(ob.amount) || 0) + moneyIn - out) };
}
function balanceCard(b) {
  if (!b) return "";
  const waiting = outbox().reduce((t, r) => t + Number(r.amount), 0);
  return `<div class="hero acct" data-go="accounts"><span class="sun"></span>
    <div class="eyebrow">APOLAKI ACCOUNT</div>
    <div class="big">${RM(b.balance + waiting)}</div>
    <div class="hero-chips"><span class="hero-chip">Since ${shortDate(b.date)} ${b.date.slice(0, 4)}</span><span class="hero-chip">In ${RM(b.moneyIn + waiting)}</span><span class="hero-chip">Out ${RM(b.out)}</span></div></div>`;
}

async function fetchHomeData() {
  const now = new Date(), ys = new Date(now.getFullYear(), 0, 1), ye = new Date(now.getFullYear() + 1, 0, 1);
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [sales, pays, exps, unpaid, recentSales, recentMoves, lastReports] = await Promise.all([
    q(live("sales", "sold_at,amount,channel").neq("channel", "retailer").gte("sold_at", ys.toISOString()).lt("sold_at", ye.toISOString())),
    q(sb.from("payouts").select("paid_on,paid_amount,net_amount").eq("paid", true).gte("paid_on", ymd(ys)).lt("paid_on", ymd(ye))),
    q(live("expenses", "spent_on,amount,description,category").gte("spent_on", ymd(ys)).lt("spent_on", ymd(ye))),
    q(sb.from("payouts").select("*").eq("paid", false).order("period_month")),
    q(live("sales", "sold_at,amount,qty,sku,channel,location_id,cart_id,report_id,description,client_id").order("sold_at", { ascending: false }).limit(60)),
    q(sb.from("stock_movements").select("moved_on,qty,sku,from_location,to_location,reason,ref,created_at").order("moved_on", { ascending: false }).order("created_at", { ascending: false }).limit(30)),
    q(sb.from("payouts").select("location_id").eq("period_month", ymd(pm)))
  ]);
  let balance = null; try { balance = await fetchBalance(); } catch {}
  let shopOpen = []; try { shopOpen = await q(live("shop_orders", "id,status").in("status", ["pending", "paid", "packed"])); } catch {}
  return { year: now.getFullYear(), sales, pays, exps, unpaid, recentSales, recentMoves, lastReports, balance, shopOpen };
}

async function renderHome() {
  const view = $("#view");
  const cached = localGet("homeData", null);
  if (cached && cached.lastReports) drawHome(cached); else view.innerHTML = `<p class="hello">${greeting()}</p><h1 class="big">How's Apolaki<br>doing today?</h1>${SKEL}`;
  try {
    const fresh = await fetchHomeData();
    if (JSON.stringify(fresh) !== JSON.stringify(cached)) { localSet("homeData", fresh); if (state.tab === "home") drawHome(fresh, true); }
  } catch { if (!cached) view.innerHTML = `<p class="hello">${greeting()}</p><h1 class="big">How's Apolaki<br>doing today?</h1><div class="warn-banner">You're offline. The Sell tab still works and syncs later.</div>`; }
}

function greeting() {
  const h = new Date().getHours();
  return `Hi${state.name ? ", " + esc(state.name) : ""}! ${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}.`;
}

/* one timeline of what happened lately: sales carts, retailer reports, stock moves, expenses */
function recentActivity(d) {
  const ev = [], carts = {};
  for (const s of d.recentSales || []) {
    if (s.report_id) { const k = "r" + s.report_id; (carts[k] = carts[k] || { at: s.sold_at, kind: "report", loc: s.location_id, rep: s.report_id, qty: 0, amt: 0 }); carts[k].qty += s.qty || 0; carts[k].amt += Number(s.amount); continue; }
    if (s.channel === "other") { ev.push({ at: s.sold_at, chip: "Money in", title: s.description || prod(s.sku)?.name || "Sale", right: RM(s.amount) }); continue; }
    const k = s.channel === "market" ? "m" + s.location_id : "c" + (s.cart_id || s.sold_at);   /* all of a market's sales and days in one line */
    (carts[k] = carts[k] || { at: s.sold_at, kind: "sale", loc: s.location_id, ch: s.channel, qty: 0, amt: 0, items: [], days: new Set() });
    if (s.sold_at > carts[k].at) carts[k].at = s.sold_at; carts[k].days.add(ymd(new Date(s.sold_at)));
    carts[k].qty += s.qty || 0; carts[k].amt += Number(s.amount); if (s.sku) carts[k].items.push(prod(s.sku)?.name || s.sku);
  }
  for (const c of Object.values(carts)) {
    if (c.kind === "report") ev.push({ at: c.at, chip: "Shop report", title: `${loc(c.loc)?.name || "Retailer"} · ${c.qty} pieces sold`, right: RM(c.amt) });
    else { const where = c.ch === "online" ? "Online order" : loc(c.loc)?.name || "Market";
      if (c.ch === "market") { ev.push({ at: c.at, chip: "Market", title: where, sub: [c.days.size > 1 ? `${c.days.size} days` : "", c.qty ? `${c.qty} pieces` : ""].filter(Boolean).join(" · "), right: RM(c.amt) }); continue; }
      ev.push({ at: c.at, chip: c.ch === "online" ? "Online" : "Market sale", title: c.items.length ? `${c.items.slice(0, 2).join(", ")}${c.items.length > 2 ? ` +${c.items.length - 2}` : ""}` : where, sub: c.items.length && c.ch !== "online" ? where : "", right: RM(c.amt) }); }
  }
  const moves = {};
  for (const m of d.recentMoves || []) { const k = [m.moved_on, m.from_location, m.to_location, m.reason, m.ref].join("|"); (moves[k] = moves[k] || { ...m, n: 0 }).n += m.qty; }
  const why = { restock: "Restock", transfer: "Stock moved", return: "Returned", loss: "Lost / damaged", correction: "Count fixed" };
  for (const m of Object.values(moves)) {
    const to = loc(m.to_location)?.name, from = loc(m.from_location)?.name;
    ev.push({ at: m.moved_on === ymd(new Date(m.created_at)) ? m.created_at : m.moved_on, chip: why[m.reason] || m.reason, title: `${m.n} piece${m.n > 1 ? "s" : ""}${from ? " from " + from : ""}${to ? " to " + to : ""}`, sub: m.ref || "" });
  }
  const ts = x => new Date(String(x).length === 10 ? x + "T23:59" : x).getTime();
  return ev.sort((a, b) => ts(b.at) - ts(a.at)).slice(0, 6);
}
const ago = s => {
  const d = new Date(String(s).length === 10 ? s + "T00:00" : s), t = new Date(); t.setHours(0, 0, 0, 0);
  const days = Math.round((t - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  const time = d.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  if (days < 0) return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  if (String(s).length === 10) return days <= 0 ? "Today" : days === 1 ? "Yesterday" : d.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
  return days <= 0 ? `Today, ${time}` : days === 1 ? `Yesterday, ${time}` : d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
};

function drawHome(d, quiet) {
  const view = $("#view"), now = new Date(), curM = ym(now), period = state.homePeriod || "month";
  const monthOf = s => ym(new Date(s.length === 10 ? s + "T00:00" : s));
  const inPeriod = s => period === "year" || monthOf(s) === curM;
  const months = Array.from({ length: 12 }, (_, i) => ym(new Date(d.year, i, 1)));
  const inc = Object.fromEntries(months.map(m => [m, 0]));
  const src = { Shops: 0, Markets: 0, Online: 0, "Other sales": 0 };
  d.sales.forEach(s => { inc[monthOf(s.sold_at)] += Number(s.amount); if (inPeriod(s.sold_at)) src[s.channel === "online" ? "Online" : s.channel === "other" ? "Other sales" : "Markets"] += Number(s.amount); });
  d.pays.forEach(p => { const a = Number(p.paid_amount ?? p.net_amount); inc[monthOf(p.paid_on)] += a; if (inPeriod(p.paid_on)) src.Shops += a; });
  outbox().forEach(r => { src[r.channel === "online" ? "Online" : "Markets"] += Number(r.amount); inc[curM] += Number(r.amount); });
  const moneyIn = Object.values(src).reduce((a, b) => a + b, 0);
  const spent = d.exps.filter(e => inPeriod(e.spent_on)).reduce((t, e) => t + Number(e.amount), 0);
  const due = d.unpaid.reduce((t, r) => t + Number(r.net_amount), 0);
  const shown = months.filter(m => m <= curM).slice(-8);
  const max = Math.max(1, ...shown.map(m => inc[m]));
  const pieces = stockTotalAt("all");
  const label = period === "year" ? String(d.year) : now.toLocaleDateString("en-MY", { month: "long" });

  const srcColors = { Shops: "var(--mauve)", Markets: "var(--peach)", Online: "var(--sage)", "Other sales": "var(--indigo)" };
  const C = 2 * Math.PI * 42; let off = 0;
  const parts = Object.values(src).filter(x => x > 0).length;
  const arcs = Object.entries(src).filter(([, v]) => v > 0).map(([k, v]) => {
    const len = moneyIn ? C * v / moneyIn : 0, gap = parts > 1 ? 2.5 : 0;
    const a = `<circle cx="50" cy="50" r="42" fill="none" stroke="${srcColors[k]}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len; return a;
  }).join("");

  const places = [workshop(), ...retailers(), ...state.locations.filter(l => l.type === "market" && l.active)].filter(Boolean);
  const placeColor = l => l.type === "workshop" ? "var(--teal)" : l.type === "retailer" ? "var(--mauve)" : "var(--peach)";
  const placeIcon = l => l.type === "workshop" ? "tool" : l.type === "retailer" ? "shop" : "tent";
  const lowD = lowStockData();
  const out = lowD.flatMap(g => g.out);
  const activeMarkets = openMarkets(), nextMarket = upcomingMarkets()[0];

  /* needs attention: things that want an action */
  const attn = [];
  const shopWait = (d.shopOpen || []).filter(o => o.status === "pending").length, shopTodo = (d.shopOpen || []).length - shopWait;
  if (shopTodo) attn.push({ c: "var(--coral)", t: `${shopTodo} paid shop order${shopTodo > 1 ? "s" : ""} to make & ship`, s: "Online shop orders", go: "shop" });
  if (shopWait) attn.push({ c: "var(--peach)", t: `${shopWait} shop order${shopWait > 1 ? "s" : ""} waiting for payment`, s: "Confirm when the money arrives", go: "shop" });
  d.unpaid.forEach(u => {
    const due = u.due_on || dueDate(u.period_month.slice(0, 7)), today = ymd(now), soon = ymd(new Date(now.getTime() + 5 * 864e5));
    if (due < today) attn.push({ c: "var(--coral)", t: `${loc(u.location_id)?.name || "Shop"} payment for ${monthLabel(u.period_month.slice(0, 7))} is overdue`, s: `${RM(u.net_amount)} was due ${shortDate(due)}`, go: "retailers" });
    else if (due <= soon) attn.push({ c: "var(--peach)", t: `${loc(u.location_id)?.name || "Shop"} pays ${monthLabel(u.period_month.slice(0, 7))} soon`, s: `${RM(u.net_amount)} due ${shortDate(due)}`, go: "retailers" });
  });
  const prevM = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  retailers().forEach(r => { const has = (d.lastReports || []).some(p => p.location_id === r.id); if (!has && now.getDate() >= 5) attn.push({ c: "var(--peach)", t: `No ${monthStart(prevM).toLocaleDateString("en-MY", { month: "long" })} sales report from ${r.name} yet`, s: "Paste it in Retailers", go: "retailers" }); });
  state.locations.filter(m => m.type === "market" && m.active && !m.cancelled_on && (m.end_date || m.start_date || "9999") >= ymd(now)).forEach(m => {
    const f = feeStatus(m), today = ymd(now), soon = ymd(new Date(now.getTime() + 5 * 864e5)), twoWk = ymd(new Date(now.getTime() + 14 * 864e5));
    if (f.key === "deposit" && m.fee_due_on && m.fee_due_on <= soon) attn.push({ c: m.fee_due_on < today ? "var(--coral)" : "var(--peach)", t: `${m.name}: ${RM(f.left)} booth fee balance ${m.fee_due_on < today ? "is overdue" : "due soon"}`, s: `Due ${shortDate(m.fee_due_on)}`, go: "market" });
    else if (f.key === "unpaid" && ((m.fee_due_on && m.fee_due_on <= soon) || (m.start_date && m.start_date <= twoWk))) attn.push({ c: "var(--peach)", t: `${m.name} isn't paid yet`, s: `Booth fee ${RM(f.total)}${m.fee_due_on ? ` · due ${shortDate(m.fee_due_on)}` : ` · market on ${shortDate(m.start_date)}`}`, go: "market" });
  });
  activeMarkets.filter(m => m.end_date && m.end_date < ymd(now)).forEach(m => attn.push({ c: "var(--peach)", t: `${m.name} ended ${shortDate(m.end_date)}`, s: "End the market to bring stock back", go: "market", sell: m.id }));
  if (out.length) attn.push({ c: "var(--coral)", t: `${out.length} size${out.length > 1 ? "s" : ""} sold out everywhere`, s: [...new Set(lowD.filter(g => g.out.length).map(g => g.name))].slice(0, 3).join(", "), go: "low" });
  if (outbox().length) attn.push({ c: "var(--mauve)", t: `${outbox().length} sale line${outbox().length > 1 ? "s" : ""} waiting to sync`, s: "Will send when you're online", go: "market" });

  const acts = recentActivity(d);
  const pc = (cls, title, val, go, sub, sun) => `<button class="pcard ${cls}" data-go="${go}">${sun ? '<span class="sun"></span>' : ""}<div class="pc-title">${esc(title)}</div><div><span class="pc-pill">${val}</span>${sub ? `<div class="pc-sub">${esc(sub)}</div>` : ""}</div></button>`;

  view.innerHTML = `
    <p class="hello">${greeting()}</p>
    <h1 class="big">How's Apolaki<br>doing today?</h1>
    <div class="ttabs"><button data-p="month" aria-pressed="${period === "month"}">This month</button><button data-p="year" aria-pressed="${period === "year"}">This year</button></div>
    ${balanceCard(d.balance)}
    <div class="masonry"><div class="mcol">
      ${pc("g-sky tall", "Money in", RM(moneyIn), "accounts", `${esc(label)} · spent ${RM(spent)}`, true)}
      ${pc("g-sea", "Pieces in stock", pieces, "stock", `${places.length} places`)}
      ${pc("g-mint", `${moneyIn - spent >= 0 ? "Profit" : "Loss"} this ${period === "year" ? "year" : "month"}`, RM(Math.abs(moneyIn - spent)), "accounts", "Money in minus spent")}
    </div><div class="mcol">
      ${pc("g-sunset", "Payouts due", RM(due), "retailers", d.unpaid.length ? d.unpaid.map(u => monthStart(u.period_month.slice(0, 7)).toLocaleDateString("en-MY", { month: "short" })).join(", ") : "All paid")}
      ${pc("g-coral tall", "Online orders", (d.shopOpen || []).length, "shop", (d.shopOpen || []).length ? [shopTodo ? `${shopTodo} to make & ship` : "", shopWait ? `${shopWait} waiting for payment` : ""].filter(Boolean).join(" · ") : "No open orders", true)}
      ${pc("g-dusk", activeMarkets.length === 1 ? "Market open" : "Markets open", activeMarkets.length, "market", activeMarkets.length ? activeMarkets.map(m => m.name).join(", ") : nextMarket ? `Next: ${nextMarket.name}, ${shortDate(nextMarket.start_date)}` : "Tap to add one")}
    </div></div>
    ${lowCard(lowD)}
    ${attn.length ? `<h2>Needs attention</h2><div class="card">${attn.map((a, i) => `<div class="attn" data-ai="${i}"><span class="dot" style="background:${a.c}"></span><div class="grow">${esc(a.t)}<span class="small muted">${esc(a.s)}</span></div>${CHEV}</div>`).join("")}</div>` : ""}
    <h2>Money in by month</h2>
    <div class="card">
      <div class="bars">${shown.map((m, i) => `<div class="bar ${m === curM ? "now" : ""}"><i style="height:${Math.max(4, inc[m] / max * 100)}%;animation-delay:${quiet ? 0 : i * 40}ms"></i><span>${monthStart(m).toLocaleDateString("en-MY", { month: "short" })}</span></div>`).join("")}</div>
    </div>
    ${moneyIn ? `<h2>Where it came from</h2>
    <div class="card">
      <div class="donut-wrap"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--input-bg)" stroke-width="12"/>${arcs}</svg>
        <div class="donut-mid"><div class="small muted">${esc(label)}</div><div class="value num">${RM(moneyIn)}</div></div></div>
      <div class="legend">${Object.entries(src).map(([k, v]) => `<div><b style="background:${srcColors[k]}"></b>${k}<span class="num">${RM(v)}</span></div>`).join("")}</div>
    </div>` : ""}
    <h2>Stock by place</h2>
    <div class="tiles">${places.map(l => { const n = stockTotalAt(l.id); return `<button class="ttile" data-place="${l.id}">${ico(placeIcon(l), placeColor(l), true)}<div class="name">${esc(l.name)}</div><div class="sub">${n} pieces</div><div class="meter"><i style="width:${pieces ? n / pieces * 100 : 0}%;background:${placeColor(l)}"></i></div><div class="sub">${pieces ? Math.round(n / pieces * 100) : 0}% of stock</div></button>`; }).join("")}</div>
    ${acts.length ? `<h2>Recent activity</h2><div class="tl">${acts.map(a => `<div class="tl-item"><span class="tl-dot"></span><div class="tl-card"><div class="tl-meta"><span class="tl-chip">${esc(a.chip)}</span><span>${ago(a.at)}</span></div><div class="tl-body"><span>${esc(a.title)}${a.sub ? `<span class="small muted" style="display:block">${esc(a.sub)}</span>` : ""}</span>${a.right ? `<strong>${a.right}</strong>` : ""}</div></div></div>`).join("")}</div>` : ""}`;
  view.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { state.homePeriod = b.dataset.p; drawHome(d, true); });
  watchShop();
  view.querySelectorAll("[data-go]").forEach(r => r.onclick = () => r.dataset.go === "shop" ? shopOrdersSheet() : r.dataset.go === "low" ? lowStockSheet() : go(r.dataset.go));
  view.querySelectorAll("[data-ai]").forEach(r => r.onclick = () => { const a = attn[Number(r.dataset.ai)]; if (a.go === "shop") return shopOrdersSheet(); if (a.go === "low") return lowStockSheet(); if (a.sell) { state.sellAt = a.sell; localSet("sellAt", a.sell); } go(a.go); });
  view.querySelectorAll("[data-place]").forEach(t => t.onclick = () => { state.stockLoc = Number(t.dataset.place); go("stock"); });
}

/* =========================================================
   RUNNING LOW — sold out, last one, and sizes not made yet (all places together)
   ========================================================= */
function lowStockData() {
  const made = new Set(state.stock.map(s => s.sku));   /* any stock or sale ever recorded */
  const where = sku => state.locations.map(l => [l, stockAt(l.id, sku)]).filter(([, n]) => n > 0);
  return sizeGroups(activeProducts(), "all").map(g => {
    const its = g.items.map(it => ({ ...it, made: made.has(it.p.sku) || it.left !== 0, where: where(it.p.sku) }));
    return { name: g.name, cat: its[0].p.category || "", lead: its[0].p, items: its,
      out: its.filter(it => it.made && it.left <= 0), last: its.filter(it => it.left === 1), notMade: its.filter(it => !it.made) };
  }).filter(g => g.out.length || g.last.length || g.notMade.length).sort((a, b) => a.name.localeCompare(b.name));
}
function lowCard(D) {
  const nOut = D.reduce((t, g) => t + g.out.length, 0), nLast = D.reduce((t, g) => t + g.last.length, 0);
  const names = D.filter(g => g.out.length || g.last.length).map(g => g.name);
  return `<button class="pcard g-sunset" data-go="low" style="min-height:0;margin:0 0 8px"><div class="pc-title">Running low</div>
    <div><span class="pc-pill">${nOut} sold out · ${nLast} last one</span><div class="pc-sub">${esc(names.length ? names.slice(0, 3).join(", ") + (names.length > 3 ? "…" : "") : "Everything has at least 2")}</div></div></button>`;
}
function lowStockSheet() {
  const D = lowStockData();
  const sz = it => it.size && sizeShort(it.p.size) ? it.size : "";
  const placeList = it => it.where.map(([l, n]) => `${esc(l.name)} ${n}`).join(" · ");
  const others = (g, skip) => g.items.filter(it => !skip.includes(it) && it.left > 0).map(it => `${sz(it) || "this"} ${it.left}${it.where.length ? ` (${placeList(it)})` : ""}`).join(", ");
  const card = (g, list, how) => `<div class="row" style="align-items:flex-start"><div class="grow">
      <div class="title" style="white-space:normal">${esc(g.name)}</div>
      ${list.map(it => `<div class="small" style="margin-top:3px"><b>${esc(sz(it) || (g.items.length > 1 ? it.p.name : ""))}${sz(it) || g.items.length > 1 ? " · " : ""}</b>${how(it)}</div>`).join("")}
      ${others(g, list) ? `<div class="small muted" style="margin-top:3px">Other sizes: ${others(g, list)}</div>` : ""}</div>
      <button type="button" class="btn small" data-add="${esc(list.map(it => it.p.sku).join(","))}" style="flex:none">Add</button></div>`;
  const byCat = (key, how) => groupByCategory(D.filter(g => g[key].length).map(g => g.lead)).map(([cat, leads]) =>
    `<h3 style="margin:14px 0 6px">${esc(CAT_PLURAL[cat] || cat)}</h3><div class="list tight">${leads.map(p => { const g = D.find(x => x.lead === p); return card(g, g[key], how); }).join("")}</div>`).join("");
  const nOut = D.reduce((t, g) => t + g.out.length, 0), nLast = D.reduce((t, g) => t + g.last.length, 0), nNew = D.reduce((t, g) => t + g.notMade.length, 0);
  openSheet(`
    <h2>Running low</h2>
    <p class="small muted" style="margin-top:-6px">Active items, counting every place together. Earrings are in pairs.</p>
    <button class="btn primary block" id="addAll">Add pieces</button>
    <h2 style="margin-top:22px">Sold out <span class="muted" style="font-size:15px">${nOut}</span></h2>
    ${nOut ? byCat("out", it => `<span style="color:var(--rust)">none left anywhere</span>`) : `<p class="small muted">Nothing sold out.</p>`}
    <h2 style="margin-top:22px">Last one <span class="muted" style="font-size:15px">${nLast}</span></h2>
    ${nLast ? byCat("last", it => `1 ${unitWord(it.p, 1)} left · ${placeList(it)}`) : `<p class="small muted">No sizes down to the last one.</p>`}
    ${nNew ? `<details class="group" style="margin-top:22px"><summary><span class="grow">Not made yet <span class="small muted" style="display:block;font-weight:500">Sizes in the app that never had stock</span></span><span class="count">${nNew}</span>${CHEV}</summary>
      <div class="inner">${byCat("notMade", () => `<span class="muted">not made yet</span>`)}</div></details>` : ""}`, root => {
    const add = skus => moveSheet({ to: workshop().id, from: null, title: "Add new pieces", restock: true, focus: skus });
    root.querySelector("#addAll").onclick = () => add(D.flatMap(g => [...g.out, ...g.last].map(it => it.p.sku)));
    root.querySelectorAll("[data-add]").forEach(b => b.onclick = () => add(b.dataset.add.split(",")));
  });
}

/* =========================================================
   SELL — market cashier and online orders
   ========================================================= */
function sellTarget() {
  const markets = openMarkets();
  const v = state.sellAt;
  if (v === "online") return { key: "online", name: "Online orders", stockLoc: workshop()?.id, channel: "online", locationId: workshop()?.id };
  const m = markets.find(l => l.id === Number(v)) || markets[0];
  if (!m) return null;
  return { key: m.id, name: m.name, stockLoc: m.id, channel: "market", locationId: m.id, market: m };
}
/* the same piece in different sizes becomes one tile; tap it to pick the size */
const SIZE_SHORT = { "extra small": "XS", "small": "S", "medium": "M", "large": "L", "extra large": "XL" };
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL"];
const sizeShort = sz => SIZE_SHORT[String(sz || "").toLowerCase()] || null;
function baseName(name) {
  return String(name)
    .replace(/^\s*size\s+(xxs|xs|s|m|l|xl|xxl)\s+/i, "")
    .replace(/\s*[-–]\s*(xxs|xs|s|m|l|xl|xxl)\s*$/i, "")
    .replace(/\s*\(?\b(extra small|small|medium|large|extra large|big)\b\)?\s*$/i, "")
    .replace(/\s+/g, " ").trim();
}
const nice = n => /[a-z]/.test(n) ? n : n.toLowerCase().replace(/(^|[\s(\-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
function sizeGroups(products, locId) {
  const map = new Map();
  for (const p of products) {
    const sz = sizeShort(p.size);
    const key = sz ? (p.family || "") + "|" + baseName(p.name).toLowerCase() : "sku|" + p.sku;
    if (!map.has(key)) map.set(key, { key, name: "", items: [] });
    map.get(key).items.push({ p, size: sz || p.size || "", left: stockAt(locId, p.sku) });
  }
  const list = [...map.values()].map(g => {
    /* tile name: the item's own name (without the size when sizes are grouped) */
    g.name = g.items.length === 1 ? nice(g.items[0].p.name) : nice(baseName(g.items[0].p.name));
    g.items.sort((a, b) => SIZE_ORDER.indexOf(a.size) - SIZE_ORDER.indexOf(b.size));
    g.left = g.items.reduce((t, it) => t + Math.max(0, it.left), 0);
    return g;
  });
  return list.sort((a, b) => (b.left > 0) - (a.left > 0) || a.name.localeCompare(b.name));
}
function cartLines() {
  return Object.entries(state.cart).filter(([sku, n]) => n > 0 && prod(sku)).map(([sku, n]) => ({ p: prod(sku), qty: n }))
    .concat((state.custom || []).filter(c => c.qty > 0).map(c => ({ p: { sku: null, name: c.name, retail_price: c.price }, qty: c.qty, custom: c.id })));
}
function cartGross() { return round2(cartLines().reduce((t, l) => t + l.qty * Number(l.p.retail_price), 0)); }
const cartPieces = () => cartLines().reduce((x, l) => x + l.qty, 0);
const cartTotal = () => state.finalPrice != null ? round2(state.finalPrice) : cartGross();
function clearCart() { state.cart = {}; state.custom = []; state.finalPrice = null; state.discount = 0; state.editPrice = false; }
/* how much each piece sold for and units per piece over the last 6 months, for "Popular" */
async function loadPopular() {
  try {
    const since = new Date(Date.now() - 183 * 864e5).toISOString();
    const rows = await q(live("sales", "sku,qty").not("sku", "is", null).gte("sold_at", since));
    const pop = {}; rows.forEach(r => pop[r.sku] = (pop[r.sku] || 0) + (r.qty || 0));
    state.pop = pop; localSet("pop", pop);
  } catch { state.pop = localGet("pop", {}); }
}
/* today's sales where you're selling now (saved ones + ones still on the phone) */
async function loadToday(t) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  try {
    const rows = await q(live("sales", "client_id,cart_id,amount,payment_method,qty").eq("location_id", t.locationId).eq("channel", t.channel).gte("sold_at", start.toISOString()));
    const key = t.key + "|" + ymd(start), fresh = JSON.stringify(rows);
    if (state.todayKey !== key || state.todayJson !== fresh) { state.todayKey = key; state.todayJson = fresh; state.todayRows = rows; return true; }
  } catch {}
  return false;
}
function todaySummary(t) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const local = outbox().filter(r => r.location_id === t.locationId && r.channel === t.channel && new Date(r.sold_at) >= start);
  const server = (state.todayKey || "").startsWith(t.key + "|") ? (state.todayRows || []) : [];
  const all = local.concat(server.filter(s => !local.some(l => l.client_id === s.client_id)));
  const by = {}; all.forEach(r => by[r.payment_method || "Other"] = (by[r.payment_method || "Other"] || 0) + Number(r.amount));
  return { sales: new Set(all.map(r => r.cart_id || r.client_id)).size, total: all.reduce((x, r) => x + Number(r.amount), 0), by };
}

async function renderSell() {
  const view = $("#view");
  const markets = openMarkets();
  /* on a market day, open the Sell tab on that market by itself (once a day, so you can still switch away) */
  const tdy = ymd(new Date()), todays = markets.find(m => m.start_date && m.start_date <= tdy && (m.end_date || m.start_date) >= tdy);
  if (todays && localGet("sellAutoDay", "") !== tdy) { state.sellAt = todays.id; localSet("sellAt", todays.id); localSet("sellAutoDay", tdy); state.cart = {}; state.openGroup = null; }
  const t = sellTarget();
  const upHtml = upcomingHtml();
  const choices = markets.map(m => `<option value="${m.id}" ${t && t.key === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")
    + `<option value="online" ${t && t.key === "online" ? "selected" : ""}>Online orders (from workshop)</option>`;
  if (!t) {
    view.innerHTML = `<h1 class="big">Sell at<br>the market</h1><div class="card"><h3>${upcomingMarkets().length ? "No market today" : "Start a market"}</h3><p class="muted">Add a market with its dates. On the first day, this tab opens on it by itself.</p><div class="btns"><button class="btn primary" id="newMarket">New market</button><button class="btn" id="goOnline">Record an online order</button><button class="btn" id="shopOrd">Shop orders</button></div></div>
      <button type="button" class="btn block" id="pastMarkets" style="margin-top:12px">Markets &amp; analysis</button>${upHtml}`;
    bindUpcoming(view);
    $("#newMarket").onclick = newMarketSheet;
    $("#pastMarkets").onclick = marketsSheet;
    $("#goOnline").onclick = () => { state.sellAt = "online"; localSet("sellAt", "online"); render(); };
    $("#shopOrd").onclick = shopOrdersSheet;
    return;
  }
  const s = state.search.toLowerCase();
  const groups = sizeGroups(activeProducts().filter(p => !s || p.name.toLowerCase().includes(s) || (p.family || "").toLowerCase().includes(s)), t.stockLoc);
  const cats = [...new Set(activeProducts().map(p => p.category || "Other"))].sort((a, b) => ((CAT_ORDER.indexOf(a) + 1) || 99) - ((CAT_ORDER.indexOf(b) + 1) || 99) || a.localeCompare(b));
  const cat = state.sellCat && (state.sellCat === "all" || cats.includes(state.sellCat)) ? state.sellCat : "all";
  /* in-stock pieces first, then A to Z */
  groups.sort((a, b) => (b.left > 0) - (a.left > 0) || a.name.localeCompare(b.name));
  const today = todaySummary(t);
  const n = cartPieces();
  document.body.classList.toggle("has-cart", n > 0);
  const pic = p => { const img = photo(p); return img ? `<img src="${img}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph ${catG(p.category)}',innerHTML:this.dataset.ico}))" data-ico="${esc(catSvg(p.category))}">` : `<div class="ph ${catG(p.category)}">${catSvg(p.category)}</div>`; };
  const stepper = (sku, qty) => `<span class="stepper"><button type="button" data-dec="${sku}" aria-label="One fewer">−</button><b>${qty}</b><button type="button" data-inc="${sku}" aria-label="One more">+</button></span>`;
  const tileHtml = g => {
    const inCart = g.items.reduce((t2, it) => t2 + (state.cart[it.p.sku] || 0), 0);
    const left = g.items.reduce((t2, it) => t2 + Math.max(0, it.left), 0);
    const open = state.openGroup === g.key;
    if (g.items.length === 1) {
      const it = g.items[0];
      return `<div class="tile ${it.left - inCart <= 0 && !inCart ? "out" : ""} ${inCart ? "in-cart" : ""}" data-add="${it.p.sku}" role="button" tabindex="0">
        ${pic(it.p)}<div class="name">${esc(g.name)}</div>
        <div class="meta">${RM(it.p.retail_price)} · ${isPair(it.p) ? units(it.p, Math.max(0, it.left - inCart)) : Math.max(0, it.left - inCart)} left</div>
        ${inCart ? stepper(it.p.sku, inCart) : ""}</div>`;
    }
    const prices = [...new Set(g.items.map(it => Number(it.p.retail_price)))];
    return `<div class="tile group-tile ${left - inCart <= 0 && !inCart ? "out" : ""} ${inCart || open ? "in-cart" : ""}" data-group="${esc(g.key)}" role="button" tabindex="0">
        ${pic(g.items[0].p)}${inCart ? `<span class="count">${inCart}</span>` : ""}
        <div class="name">${esc(g.name)}</div>
        <div class="meta">${prices.length > 1 ? "From " : ""}${RM(Math.min(...prices))} · ${isPair(g.items[0].p) ? units(g.items[0].p, left) : left} left</div>
        <div class="size-chips">${g.items.map(it => `<span class="${it.left > 0 ? "" : "none"}">${esc(it.size)}</span>`).join("")}</div></div>
      ${open ? `<div class="sizes"><div class="sizes-head"><b>Choose size</b><button type="button" class="link" data-close="1">Done</button></div>
        ${g.items.map(it => { const q2 = state.cart[it.p.sku] || 0; return `<div class="size-row ${it.left - q2 <= 0 && !q2 ? "out" : ""}"><span class="size-name">${esc(it.size)}</span><span class="size-meta">${RM(it.p.retail_price)} · ${Math.max(0, it.left - q2)} left</span>${stepper(it.p.sku, q2)}</div>`; }).join("")}</div>` : ""}`;
  };
  view.innerHTML = `<h1 class="big">Sell at<br>the market</h1>
    <label class="field"><span>Selling at</span><select id="sellAt">${choices}</select></label>
    <button type="button" class="today-strip" id="todayStrip"><span><b>Today</b> · ${today.sales} sale${today.sales === 1 ? "" : "s"}</span><strong>${RM(today.total)}</strong>${Object.entries(today.by).map(([k, v]) => `<span class="tp">${esc(k)} ${RM(v)}</span>`).join("")}${CHEV}</button>
    <div class="btns">
      ${t.market ? `<button class="btn" id="bring">Bring stock</button>` : ""}
      <button class="btn" id="today">Today's sales</button>
      <button class="btn" id="newMarket">New market</button>
      <button class="btn" id="pastMarkets">All markets</button>
      ${t.market ? `<button class="btn danger" id="endMarket">End market</button>` : ""}
    </div>
    ${t.market && stockTotalAt(t.market.id) === 0 ? `<div class="card" style="margin:0 0 12px"><h3 style="margin-top:0">No stock at ${esc(t.market.name)} yet</h3><p class="small muted">Bring the pieces over so the counts here are right.</p>
      <div class="btns"><button class="btn primary" id="bringAll">Bring all workshop stock</button><button class="btn" id="bringSome">Choose pieces</button></div></div>` : ""}
    <input class="search" id="search" type="search" placeholder="Search pieces" value="${esc(state.search)}">
    <div class="ttabs sell-tabs">${[["all", "All"], ...cats.map(c => [c, CAT_PLURAL[c] || c])].map(([k, l]) => `<button type="button" class="ctab ${k === "all" || k === "popular" ? "c-all" : catG(k)}" data-cat="${esc(k)}" aria-pressed="${cat === k}">${esc(l)}</button>`).join("")}</div>
    <div id="grid">${(cat === "all" ? cats : [cat]).map(c => { const gs = groups.filter(g => (g.items[0].p.category || "Other") === c); return gs.length ? (cat === "all" ? `<div class="cat-h"><span class="cat-pill ${catG(c)}">${esc(CAT_PLURAL[c] || c)}</span><b>${gs.length}</b></div>` : "") + `<div class="grid sm">${gs.map(tileHtml).join("")}</div>` : ""; }).join("") || `<div class="empty">No pieces match.</div>`}</div>
    <button type="button" class="other-btn" id="otherPiece" style="margin-top:16px">+ Other piece</button>
    ${upHtml}
    ${n ? `<div class="cartbar">
      <div class="cb-info">
        <div class="small">${n} piece${n > 1 ? "s" : ""} · <button type="button" class="link" id="review">Details</button> · <button type="button" class="link" id="clearCart">Clear</button></div>
        ${state.editPrice ? `<div class="cb-price"><input id="finalIn" type="number" inputmode="decimal" min="0" step="0.01" placeholder="${cartGross().toFixed(2)}" value="${state.finalPrice ?? ""}"><button type="button" class="link" id="finalOk">OK</button></div>`
          : `<button type="button" class="cb-total" id="editPrice" title="Tap to type the final price"><span class="num">${RM(cartTotal())}</span>${state.finalPrice != null && cartTotal() !== cartGross() ? `<s>${RM(cartGross())}</s>` : `<em>edit</em>`}</button>`}
      </div>
      <div class="cb-pay"><button type="button" class="btn pay" data-paynow="Cash">Cash</button><button type="button" class="btn pay" data-paynow="QR">QR</button></div></div>` : ""}`;
  $("#sellAt").onchange = e => { state.sellAt = e.target.value; localSet("sellAt", e.target.value); state.cart = {}; state.openGroup = null; render(); };
  $("#search").oninput = e => { state.search = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#search"); i.focus(); i.setSelectionRange(pos, pos); };
  const add = sku => {
    const left = stockAt(t.stockLoc, sku), have = state.cart[sku] || 0;
    if (have >= left) toast("Stock here says none left. Added anyway — fix the count later in Stock.");
    state.cart[sku] = have + 1;
  };
  view.querySelectorAll("[data-cat]").forEach(b => b.onclick = () => { state.sellCat = b.dataset.cat; localSet("sellCat", state.sellCat); state.openGroup = null; render(); });
  $("#grid").onclick = e => {
    const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]");
    if (inc) { add(inc.dataset.inc); return render(); }
    if (dec) { const k = dec.dataset.dec; state.cart[k] = Math.max(0, (state.cart[k] || 0) - 1); if (!state.cart[k]) delete state.cart[k]; return render(); }
    if (e.target.closest("[data-close]")) { state.openGroup = null; return render(); }
    const g = e.target.closest("[data-group]");
    if (g) { state.openGroup = state.openGroup === g.dataset.group ? null : g.dataset.group; return render(); }
    const one = e.target.closest("[data-add]");
    if (one) { add(one.dataset.add); render(); }
  };
  if ($("#clearCart")) $("#clearCart").onclick = () => { clearCart(); state.openGroup = null; toast("Cart cleared"); render(); };
  $("#otherPiece").onclick = otherPieceSheet;
  $("#todayStrip").onclick = () => todaySheet(t);
  view.querySelectorAll("[data-paynow]").forEach(b => b.onclick = () => { state.payment = b.dataset.paynow; state.openGroup = null; completeSale(t, b.dataset.paynow); });
  const ep = $("#editPrice"); if (ep) ep.onclick = () => { state.editPrice = true; render(); const i = $("#finalIn"); if (i) i.focus(); };
  const fi = $("#finalIn");
  if (fi) {
    const apply = () => { const v = fi.value.trim(); state.finalPrice = v === "" ? null : Math.max(0, Number(v) || 0); state.editPrice = false; render(); };
    $("#finalOk").onclick = apply; fi.onkeydown = e => { if (e.key === "Enter") apply(); };
  }
  loadToday(t).then(changed => { if (changed && state.tab === "market" && $("#sheet").hidden && !state.editPrice) render(); });
  $("#newMarket").onclick = newMarketSheet;
  $("#pastMarkets").onclick = marketsSheet;
  $("#today").onclick = () => todaySheet(t);
  if ($("#review")) $("#review").onclick = () => reviewSheet(t);
  if ($("#bring")) $("#bring").onclick = () => bringStockSheet(t.market);
  if ($("#bringAll")) $("#bringAll").onclick = () => bringAllSheet(t.market);
  if ($("#bringSome")) $("#bringSome").onclick = () => moveSheet({ to: t.market.id, from: workshop()?.id, title: `Bring stock to ${t.market.name}` });
  bindUpcoming(view);
  if ($("#endMarket")) $("#endMarket").onclick = () => endMarketSheet(t.market);
}

function reviewSheet(t) {
  const draw = () => {
    const lines = cartLines(), gross = cartGross(), total = cartTotal();
    openSheet(`
      <h2>Sale at ${esc(t.name)}</h2>
      <div class="list tight">${lines.map(l => `<div class="row"><div class="grow"><div class="title" style="white-space:normal">${esc(nice(l.p.name))}${l.custom ? ` <span class="tag">One-off</span>` : ""}</div><div class="small muted">${RM(l.p.retail_price)} each</div></div>
        <span class="stepper"><button type="button" data-d="-1" data-k="${l.custom ? "c:" + l.custom : l.p.sku}">−</button><b>${l.qty}</b><button type="button" data-d="1" data-k="${l.custom ? "c:" + l.custom : l.p.sku}">+</button></span></div>`).join("")}</div>
      <label class="field" style="margin-top:14px"><span>Final price (RM), only if the customer pays a different amount</span><input id="final" type="number" inputmode="decimal" min="0" step="0.01" placeholder="${gross.toFixed(2)}" value="${state.finalPrice ?? ""}"></label>
      <label class="field"><span>Paid by</span></label>
      <div class="chips" style="margin-top:-6px">${PAYMENTS.map(p => `<button class="chip" data-pay="${p}" aria-pressed="${state.payment === p}">${p}</button>`).join("")}</div>
      <div class="row" style="margin:12px 0"><span>Total${state.finalPrice != null && total !== gross ? ` <span class="small muted" style="text-decoration:line-through">${RM(gross)}</span>` : ""}</span><strong class="num" style="font-size:22px">${RM(total)}</strong></div>
      <button class="btn primary block" id="complete">Complete sale · ${esc(state.payment)}</button>
      <div class="btns" style="margin-top:10px"><button class="btn" id="clear">Clear cart</button><button class="btn" id="close">Keep selling</button></div>`, root => {
      root.querySelectorAll("[data-d]").forEach(b => b.onclick = () => {
        const k = b.dataset.k, d = Number(b.dataset.d);
        if (k.startsWith("c:")) { const c = state.custom.find(x => x.id === k.slice(2)); if (c) c.qty = Math.max(0, c.qty + d); state.custom = state.custom.filter(x => x.qty > 0); }
        else { state.cart[k] = Math.max(0, (state.cart[k] || 0) + d); if (!state.cart[k]) delete state.cart[k]; }
        if (!cartLines().length) { clearCart(); closeSheet(); render(); } else draw();
      });
      root.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => { state.payment = b.dataset.pay; draw(); });
      root.querySelector("#final").onchange = e => { const v = e.target.value.trim(); state.finalPrice = v === "" ? null : Math.max(0, Number(v) || 0); draw(); };
      root.querySelector("#clear").onclick = () => { clearCart(); closeSheet(); render(); };
      root.querySelector("#close").onclick = () => { closeSheet(); render(); };
      root.querySelector("#complete").onclick = () => completeSale(t, state.payment);
    });
  };
  draw();
}

function completeSale(t, method) {
  const lines = cartLines(); if (!lines.length) return;
  const gross = cartGross(), total = cartTotal(), diff = round2(gross - total);
  const now = new Date(), cart = uuid(), sm = ym(now) + "-01";
  let left = total;
  const rows = lines.map((l, i) => {
    const lineGross = l.qty * Number(l.p.retail_price);
    const amt = i === lines.length - 1 ? round2(left) : round2(gross ? total * lineGross / gross : 0);
    left = round2(left - amt);
    return { client_id: uuid(), cart_id: cart, sold_at: now.toISOString(), sale_month: sm, channel: t.channel, location_id: t.locationId,
      sku: l.p.sku, qty: l.qty, unit_price: Number(l.p.retail_price), amount: amt, payment_method: method,
      description: l.custom ? l.p.name : null,
      notes: diff > 0.004 ? `Final price ${RM(total)} (RM${diff.toFixed(2)} off)` : diff < -0.004 ? `Final price ${RM(total)}` : null };
  });
  const before = { cart: { ...state.cart }, custom: (state.custom || []).map(c => ({ ...c })), finalPrice: state.finalPrice };
  setOutbox(outbox().concat(rows));
  clearCart(); closeSheet(); render();
  toast(`Sale saved · ${RM(total)} ${method}`, { label: "Undo", run: () => undoSale(cart, before) });
  sync();
}
/* undo: take the sale back out (still on the phone, or already sent), and put the pieces back in the cart */
async function undoSale(cartId, before) {
  setOutbox(outbox().filter(r => r.cart_id !== cartId));
  state.cart = before.cart; state.custom = before.custom; state.finalPrice = before.finalPrice;
  render();
  try { await q(sb.from("sales").update({ deleted_at: new Date().toISOString() }).eq("cart_id", cartId)); } catch (e) { console.warn("undo later", e); }
  await loadStock(); state.todayJson = null; render(); toast("Sale undone. The pieces are back in the cart.");
}

/* a one-off piece that isn't in the app */
function otherPieceSheet() {
  openSheet(`
    <h2>Other piece</h2>
    <p class="small muted">For a one-off or custom piece that isn't in the app. It's added to this sale only and doesn't change stock.</p>
    <form id="f">
      <label class="field"><span>What is it</span><input name="name" required placeholder="e.g. Custom name ring"></label>
      <label class="field"><span>Price (RM)</span><input name="price" type="number" step="0.01" min="0" inputmode="decimal" required></label>
      <label class="field"><span>How many</span><input name="qty" type="number" step="1" min="1" inputmode="numeric" value="1"></label>
      <button class="btn primary block">Add to sale</button>
    </form>`, root => root.querySelector("#f").onsubmit = e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      const price = round2(Number(f.price)); if (!(price >= 0) || !f.name.trim()) return toast("Enter a name and price");
      state.custom = (state.custom || []).concat({ id: uuid(), name: f.name.trim(), price, qty: Math.max(1, parseInt(f.qty, 10) || 1) });
      closeSheet(); toast("Added to the sale"); render();
    });
}

async function todaySheet(t) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  let server = [];
  try {
    let qy = live("sales", "*").eq("location_id", t.locationId).eq("channel", t.channel).gte("sold_at", start.toISOString()).order("sold_at", { ascending: false });
    server = await q(qy);
  } catch {}
  const local = outbox().filter(r => r.location_id === t.locationId && r.channel === t.channel && new Date(r.sold_at) >= start);
  const all = local.concat(server.filter(s => !local.some(l => l.client_id === s.client_id)));
  const carts = {};
  for (const r of all) { const k = r.cart_id || r.client_id || r.id; (carts[k] = carts[k] || { rows: [], at: r.sold_at, pay: r.payment_method }).rows.push(r); }
  const total = all.reduce((x, r) => x + Number(r.amount), 0), pcs = all.reduce((x, r) => x + (r.qty || 0), 0);
  const byPay = {}; all.forEach(r => byPay[r.payment_method || "—"] = (byPay[r.payment_method || "—"] || 0) + Number(r.amount));
  openSheet(`
    <h2 style="margin-top:0">Today at ${esc(t.name)}</h2>
    <div class="figures"><div class="figure lead"><div class="label">${pcs} pieces sold</div><div class="value">${RM(total)}</div></div>
      ${Object.entries(byPay).map(([k, v]) => `<div class="figure"><div class="label">${esc(k)}</div><div class="value">${RM(v)}</div></div>`).join("")}</div>
    <div class="list tight">${Object.entries(carts).map(([k, c]) => `<div class="row"><div class="grow"><div class="title">${c.rows.map(r => `${r.qty || 1}× ${esc(nice(prod(r.sku)?.name || r.description || r.sku || "Piece"))}`).join(", ")}</div>
      <div class="small muted">${new Date(c.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })} · ${esc(c.pay || "")}</div></div>
      <span class="num">${RM(c.rows.reduce((x, r) => x + Number(r.amount), 0))}</span><button class="link" data-edit="${esc(k)}" style="background:none;border:0">Edit</button><button class="link" data-cart="${esc(k)}" style="background:none;border:0;color:var(--rust)">Remove</button></div>`).join("") || `<div class="empty">No sales yet today.</div>`}</div>
    <button class="btn block" id="close">Close</button>`, root => {
    root.querySelector("#close").onclick = closeSheet;
    root.querySelectorAll("[data-edit]").forEach(b => b.onclick = () => saleEditSheet(carts[b.dataset.edit].rows, { where: t.name, done: () => { todaySheet(t); render(); } }));
    root.querySelectorAll("[data-cart]").forEach(b => b.onclick = async () => {
      if (!confirm("Remove this sale? The pieces go back into stock.")) return;
      const k = b.dataset.cart;
      setOutbox(outbox().filter(r => (r.cart_id || r.client_id) !== k));
      try { const rows = carts[k].rows.filter(r => r.id); if (rows.length) await q(sb.from("sales").update({ deleted_at: new Date().toISOString() }).in("id", rows.map(r => r.id))); } catch (e) { return fail(e); }
      await loadStock(); toast("Sale removed"); todaySheet(t); render();
    });
  });
}

/* =========================================================
   MARKETS — every market (all its days together) with its numbers
   ========================================================= */
async function loadMarketData() {
  const [sales, fees] = await Promise.all([
    q(live("sales", "id,sold_at,amount,qty,sku,unit_price,payment_method,location_id,channel,cart_id,client_id,notes,description").eq("channel", "market")),
    q(live("expenses", "spent_on,amount,description,paid_to,location_id").eq("category", "Market Fee"))
  ]);
  /* sales still waiting on this phone count too */
  const local = outbox().filter(r => r.channel === "market" && !sales.some(s => s.client_id && s.client_id === r.client_id));
  return { sales: sales.concat(local), fees };
}
function marketStats(m, d) {
  const sl = d.sales.filter(s => s.location_id === m.id);
  const total = sl.reduce((t, s) => t + Number(s.amount), 0);
  const itemised = sl.filter(s => s.sku || s.description);
  const pieces = itemised.reduce((t, s) => t + (s.qty || 0), 0);
  const days = {}; sl.forEach(s => { const k = ymd(new Date(s.sold_at)); days[k] = (days[k] || 0) + Number(s.amount); });
  /* market days: the dates set on the market, otherwise the days that had sales */
  let dayList = [];
  if (m.start_date) { for (let t = new Date(m.start_date + "T00:00"), e = new Date((m.end_date || m.start_date) + "T00:00"); t <= e; t.setDate(t.getDate() + 1)) dayList.push(ymd(t)); }
  Object.keys(days).forEach(k => { if (!dayList.includes(k)) dayList.push(k); });
  dayList.sort();
  const nm = m.name.toLowerCase();
  const linked = d.fees.filter(f => f.location_id === m.id);
  const feeRows = linked.length ? linked : d.fees.filter(f => { if (f.location_id) return false; const t = `${f.description || ""} ${f.paid_to || ""}`.toLowerCase(); return t.includes(nm) || nm.split(/\s+/).filter(w => w.length > 2 && !/market/.test(w)).some(w => t.includes(w)); });
  const fee = m.cancelled_on ? feeRows.reduce((t, f) => t + Number(f.amount), 0) : m.fee != null ? Number(m.fee) : feeRows.reduce((t, f) => t + Number(f.amount), 0);
  const feeKnown = m.fee != null || feeRows.length > 0;
  const pay = {}; sl.forEach(s => { if (s.payment_method) pay[s.payment_method] = (pay[s.payment_method] || 0) + Number(s.amount); });
  const sortDate = dayList[0] || feeRows.map(f => f.spent_on).sort()[0] || "0000";
  return { m, sl, total, pieces, itemised: itemised.length > 0, imported: sl.length > 0 && !itemised.length, days, dayList, nDays: Math.max(1, dayList.length), fee, feeKnown,
    net: total - fee, perDay: total / Math.max(1, dayList.length), pay, sortDate, running: !!m.active && !isUpcoming(m), cancelled: !!m.cancelled_on };
}
async function marketsSheet() {
  let d;
  try { d = await loadMarketData(); localSet("mdata", d); } catch (e) { d = localGet("mdata", null); if (!d) return fail(e); }
  const list = state.locations.filter(l => l.type === "market" && !isUpcoming(l)).map(m => marketStats(m, d)).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
  const withSales = list.filter(x => x.total > 0);
  const T = k => list.reduce((t, x) => t + x[k], 0);
  const best = withSales.slice().sort((a, b) => b.perDay - a.perDay)[0];
  const dates = x => !x.dayList.length ? "Dates not set" : x.dayList.length === 1 ? shortDate(x.dayList[0]) + " " + x.dayList[0].slice(0, 4) : `${shortDate(x.dayList[0])}–${shortDate(x.dayList[x.dayList.length - 1])} ${x.dayList[0].slice(0, 4)} · ${x.dayList.length} days`;
  openSheet(`
    <h2>Markets</h2>
    <div class="figures">
      <div class="figure lead"><div class="label">${list.length} markets · ${withSales.length} with sales</div><div class="value">${RM(T("total"))}</div></div>
      <div class="figure"><div class="label">Booth fees</div><div class="value">${RM(T("fee"))}</div></div>
      <div class="figure"><div class="label">After fees</div><div class="value">${RM(T("total") - T("fee"))}</div></div>
      ${best ? `<div class="figure" style="grid-column:1/-1"><div class="label">Best per day</div><div class="value" style="font-size:16px">${esc(best.m.name)} · ${RM(best.perDay)} a day</div></div>` : ""}
    </div>
    <div class="list">${list.map(x => `<div class="row" data-mk="${x.m.id}"><div class="grow">
      <div class="title" style="white-space:normal">${esc(x.m.name)}${x.running ? ` ${tag("Running", "green")}` : ""}${x.cancelled ? ` ${tag("Cancelled", "rust")}` : ""}</div>
      <div class="small muted">${esc(dates(x))}${x.m.venue ? ` · ${esc(x.m.venue)}` : ""}</div>
      <div class="small muted">${x.cancelled ? (x.fee > 0.004 ? `<span style="color:var(--rust)">Cancelled · ${RM(x.fee)} not refunded</span>` : "Cancelled · fully refunded") : x.total ? `${RM(x.perDay)} a day` : x.feeKnown ? `<span style="color:var(--rust)">Fee paid, no sales recorded</span>` : "No sales recorded"}${x.feeKnown && !x.cancelled ? ` · fee ${RM(x.fee)} · after fee ${RM(x.net)}` : ""}</div></div>
      <span class="num">${RM(x.total)}</span></div>`).join("") || `<div class="empty">No markets yet.</div>`}</div>`, root => {
    root.querySelectorAll("[data-mk]").forEach(r => r.onclick = () => marketDetailSheet(list.find(x => x.m.id === Number(r.dataset.mk)), list));
  });
}
function marketDetailSheet(x, all) {
  const m = x.m, ranked = all.filter(y => y.total > 0).sort((a, b) => b.perDay - a.perDay), rank = ranked.indexOf(x) + 1;
  /* typical (middle) day at the other markets — one huge market can't skew it */
  const avgOthers = (() => { const o = ranked.filter(y => y !== x).map(y => y.perDay).sort((a, b) => a - b); if (!o.length) return null; const h = Math.floor(o.length / 2); return o.length % 2 ? o[h] : (o[h - 1] + o[h]) / 2; })();
  /* pieces sold, sizes of one design together */
  const by = {};
  x.sl.forEach(s => { const p = s.sku ? prod(s.sku) : null; const k = p ? nice(baseName(p.name)) : (s.description || "Other piece"); const o = by[k] = by[k] || { name: k, qty: 0, amt: 0, cat: p?.category }; o.qty += s.qty || 0; o.amt += Number(s.amount); });
  const items = Object.values(by).filter(o => o.name !== "Other piece" || o.qty).sort((a, b) => b.qty - a.qty || b.amt - a.amt);
  const cats = {}; items.forEach(o => { const k = o.cat || "Other"; cats[k] = (cats[k] || 0) + o.amt; });
  const saleCarts = groupSales(x.sl), saleDays = [];
  Object.values(saleCarts).sort((a, b) => String(b.at).localeCompare(String(a.at))).forEach(c => { const dd = ymd(new Date(c.at)); const g = saleDays.find(s => s[0] === dd); g ? g[1].push(c) : saleDays.push([dd, [c]]); });
  openSheet(`
    <h2>${esc(m.name)}</h2>
    <p class="small muted" style="margin-top:-6px">${x.dayList.length ? `${x.dayList.map(dd => shortDate(dd)).join(", ")} ${x.dayList[0].slice(0, 4)}` : "Dates not set"}${m.venue ? ` · ${esc(m.venue)}` : ""}${x.running ? " · running now" : ""}</p>
    <div class="figures">
      <div class="figure lead"><div class="label">Sales${x.dayList.length ? ` · ${x.nDays} day${x.nDays > 1 ? "s" : ""}` : ""}</div><div class="value">${RM(x.total)}</div></div>
      <div class="figure"><div class="label">Per day</div><div class="value">${RM(x.perDay)}</div></div>
      <div class="figure"><div class="label">Booth fee</div><div class="value">${x.feeKnown ? RM(x.fee) : "—"}</div></div>
      <div class="figure"><div class="label">After fee</div><div class="value">${x.feeKnown ? RM(x.net) : "—"}</div></div>
      <div class="figure"><div class="label">Fee share of sales</div><div class="value">${x.feeKnown && x.total ? Math.round(x.fee / x.total * 100) + "%" : "—"}</div></div>
      ${x.itemised ? `<div class="figure"><div class="label">Pieces sold</div><div class="value">${x.pieces}</div></div><div class="figure"><div class="label">Avg per piece</div><div class="value">${x.pieces ? RM(x.total / x.pieces) : "—"}</div></div>` : ""}
      ${rank ? `<div class="figure"><div class="label">Rank (per day)</div><div class="value">${rank} of ${ranked.length}</div></div>` : ""}
    </div>
    ${avgOthers != null && x.total ? `<p class="small muted">${x.perDay >= avgOthers ? "Above" : "Below"} a typical market day (${RM(avgOthers)}, the middle of the other markets).</p>` : ""}
    ${!x.total ? `<div class="warn-banner">No sales recorded for this market${x.feeKnown ? `, but a ${RM(x.fee)} fee was paid` : ""}. If it went ahead, add its sales with “+ Add money in” on Accounts.</div>` : ""}
    ${x.imported ? `<p class="small muted">Only daily totals were recorded for this market, so there's no breakdown by piece.</p>` : ""}
    ${x.dayList.length ? `<h3>By day</h3><div class="card"><table class="simple">${x.dayList.map((dd, i) => `<tr><td>Day ${i + 1} · ${new Date(dd + "T00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}</td><td class="r">${RM(x.days[dd] || 0)}</td></tr>`).join("")}
      <tr><td><strong>Total</strong></td><td class="r"><strong>${RM(x.total)}</strong></td></tr></table></div>` : ""}
    ${Object.keys(x.pay).length ? `<h3>Payments</h3><div class="card"><table class="simple">${Object.entries(x.pay).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r">${RM(v)}</td><td class="r muted">${Math.round(v / x.total * 100)}%</td></tr>`).join("")}</table></div>` : ""}
    ${x.itemised ? `<h3>What sold</h3><div class="card"><table class="simple"><tr><th>Piece</th><th class="r">Sold</th><th class="r">Sales</th></tr>${items.map(o => `<tr><td>${o.cat ? `<span class="cat-bar ${catG(o.cat)}"></span> ` : ""}${esc(o.name)}</td><td class="r">${o.qty}</td><td class="r">${RM(o.amt)}</td></tr>`).join("")}</table></div>
      <h3>By category</h3><div class="card"><table class="simple">${Object.entries(cats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(CAT_PLURAL[k] || k)}</td><td class="r">${RM(v)}</td><td class="r muted">${x.total ? Math.round(v / x.total * 100) : 0}%</td></tr>`).join("")}</table></div>` : ""}
    ${saleDays.length ? `<h3>All sales</h3><p class="small muted" style="margin-top:-4px">Tap a sale to fix the piece, size, quantity, price or payment.</p>
      ${saleDays.map(([dd, cs]) => `<div class="sale-day"><b>${new Date(dd + "T00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}</b><span>${cs.length} sale${cs.length > 1 ? "s" : ""} · ${RM(cs.reduce((t, c) => t + c.total, 0))}</span></div>
        <div class="list tight">${cs.map(c => `<div class="row tap" data-sale="${esc(c.k)}" role="button" tabindex="0"><div class="grow"><div class="title" style="white-space:normal">${esc(saleLabel(c.rows))}</div>
          <div class="small muted">${new Date(c.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}${c.pay ? " · " + esc(c.pay) : ""}${c.rows.some(r => !r.id) ? " · on this phone" : ""}</div></div>
          <span class="num">${RM(c.total)}</span>${CHEV}</div>`).join("")}</div>`).join("")}` : ""}
  `, root => {
    root.querySelectorAll("[data-sale]").forEach(r => r.onclick = () => saleEditSheet(saleCarts[r.dataset.sale].rows, { where: m.name, done: () => refreshMarketDetail(m.id) }));
  });
}
/* reload a market's numbers after a sale was fixed, and show its page again */
async function refreshMarketDetail(id) {
  let d; try { d = await loadMarketData(); localSet("mdata", d); } catch (e) { return fail(e); }
  const list = state.locations.filter(l => l.type === "market" && !isUpcoming(l)).map(m => marketStats(m, d));
  const x = list.find(y => y.m.id === id); if (x) marketDetailSheet(x, list);
}
/* group sale lines into sales (one cart = one sale) */
function groupSales(rows) {
  const carts = {};
  for (const r of rows) { const k = r.cart_id || r.client_id || String(r.id); (carts[k] = carts[k] || { k, rows: [], at: r.sold_at, pay: r.payment_method, total: 0 }).rows.push(r); carts[k].total += Number(r.amount); }
  return carts;
}
const saleLabel = rows => rows.map(r => r.sku || r.description ? `${r.qty || 1}× ${nice(prod(r.sku)?.name || r.description || r.sku)}` : "Day total").join(", ");

/* fix a sale that was entered wrongly: piece/size, how many, amount, payment — or take pieces out.
   Stock follows automatically (stock = what came in minus what's sold). Removed lines are hidden, not erased. */
function saleEditSheet(rows, opts) {
  if (rows.some(r => /^Shop order/i.test(r.notes || ""))) return toast("This sale belongs to an online shop order. Change it from Online orders.");
  /* a line that was sold below/above the list price (a discount) keeps its amount unless you change it */
  const lines = rows.map(r => ({ r, sku: r.sku, qty: r.qty || 1, amount: Number(r.amount), description: r.description || "", gone: false,
    typed: !!r.sku && Math.abs(Number(r.amount) - (r.qty || 1) * Number(r.unit_price ?? prod(r.sku)?.retail_price ?? 0)) > 0.004 }));
  let pay = rows[0].payment_method || "Cash";
  const kind = l => l.r.sku ? "piece" : l.r.description ? "other" : "total";
  const price = l => Number(prod(l.sku)?.retail_price || l.r.unit_price || 0);
  const at = new Date(rows[0].sold_at);
  /* pieces to pick from: active ones by category, plus the one already on the sale if it's no longer active */
  const options = cur => {
    const list = activeProducts().slice(); if (cur && !list.some(p => p.sku === cur) && prod(cur)) list.push(prod(cur));
    const cats = [...new Set(list.map(p => p.category || "Other"))].sort((a, b) => ((CAT_ORDER.indexOf(a) + 1) || 99) - ((CAT_ORDER.indexOf(b) + 1) || 99) || a.localeCompare(b));
    return cats.map(c => `<optgroup label="${esc(CAT_PLURAL[c] || c)}">${list.filter(p => (p.category || "Other") === c).sort((a, b) => a.name.localeCompare(b.name) || sizeRank(a.sku) - sizeRank(b.sku))
      .map(p => `<option value="${esc(p.sku)}" ${p.sku === cur ? "selected" : ""}>${esc(nice(p.name))}${sizeShort(p.size) && !/[-–]\s*(xxs|xs|s|m|l|xl|xxl)\s*$/i.test(p.name) ? " (" + sizeShort(p.size) + ")" : ""}</option>`).join("")}</optgroup>`).join("");
  };
  const draw = () => {
    const live1 = lines.filter(l => !l.gone), total = live1.reduce((t, l) => t + (Number(l.amount) || 0), 0);
    openSheet(`
      <h2>Edit sale</h2>
      <p class="small muted" style="margin-top:-6px">${esc(opts.where || "")} · ${at.toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short" })}, ${at.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })}</p>
      ${lines.map((l, i) => l.gone ? "" : `<div class="card es-line">
        ${kind(l) === "piece" ? `<label class="field"><span>Piece</span><select data-i="${i}" data-k="sku">${options(l.sku)}</select></label>`
          : kind(l) === "other" ? `<label class="field"><span>Other piece</span><input data-i="${i}" data-k="description" value="${esc(l.description)}"></label>` : `<p class="small muted" style="margin:0 0 8px">Day total (no pieces recorded)</p>`}
        <div class="two">
          ${kind(l) === "total" ? "" : `<label class="field"><span>How many</span><input data-i="${i}" data-k="qty" type="number" min="1" step="1" inputmode="numeric" value="${l.qty}"></label>`}
          <label class="field"><span>Amount (RM)</span><input data-i="${i}" data-k="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${(Number(l.amount) || 0).toFixed(2)}"></label>
        </div>
        ${kind(l) === "piece" ? `<p class="small muted es-hint">${RM(price(l))} each${l.typed ? "" : " · amount follows the price"}</p>` : ""}
        ${live1.length > 1 ? `<button type="button" class="link es-rm" data-rm="${i}">Take this piece out of the sale</button>` : ""}
      </div>`).join("")}
      <label class="field"><span>Paid by</span></label>
      <div class="chips" style="margin-top:-6px">${PAYMENTS.map(p => `<button type="button" class="chip" data-pay="${p}" aria-pressed="${pay === p}">${p}</button>`).join("")}</div>
      <div class="row" style="margin:12px 0"><span>Total</span><strong class="num" id="esTotal" style="font-size:22px">${RM(total)}</strong></div>
      <button class="btn primary block" id="save">Save changes</button>
      <button class="btn danger block" id="delAll" style="margin-top:10px">Remove the whole sale</button>`, root => {
      const setTotal = () => { root.querySelector("#esTotal").textContent = RM(lines.filter(l => !l.gone).reduce((t, l) => t + (Number(l.amount) || 0), 0)); };
      root.querySelectorAll("[data-k]").forEach(el => {
        const l = lines[el.dataset.i], k = el.dataset.k;
        el.addEventListener(k === "sku" ? "change" : "input", () => {
          if (k === "sku") {
            l.sku = el.value; if (!l.typed) { l.amount = round2(l.qty * price(l)); root.querySelector(`[data-i="${el.dataset.i}"][data-k="amount"]`).value = l.amount.toFixed(2); }
            const h = el.closest(".es-line").querySelector(".es-hint"); if (h) h.textContent = `${RM(price(l))} each${l.typed ? "" : " · amount follows the price"}`;
          }
          if (k === "qty") { l.qty = Math.max(1, parseInt(el.value, 10) || 1); if (kind(l) === "piece" && !l.typed) { l.amount = round2(l.qty * price(l)); root.querySelector(`[data-i="${el.dataset.i}"][data-k="amount"]`).value = l.amount.toFixed(2); } }
          if (k === "amount") { l.amount = el.value; l.typed = true; const h = el.closest(".es-line").querySelector(".es-hint"); if (h) h.textContent = `${RM(price(l))} each`; }
          if (k === "description") l.description = el.value;
          setTotal();
        });
      });
      root.querySelectorAll("[data-rm]").forEach(b => b.onclick = () => { lines[b.dataset.rm].gone = true; draw(); });
      root.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => { pay = b.dataset.pay; root.querySelectorAll("[data-pay]").forEach(c => c.setAttribute("aria-pressed", c === b)); });
      root.querySelector("#save").onclick = () => save(false);
      root.querySelector("#delAll").onclick = () => { if (confirm("Remove this whole sale? The pieces go back into stock.")) save(true); };
    });
  };
  async function save(all) {
    const keep = all ? [] : lines.filter(l => !l.gone), drop = all ? lines : lines.filter(l => l.gone);
    for (const l of keep) {
      const a = Number(l.amount);
      if (!(a >= 0) || String(l.amount).trim() === "") return toast("Check the amounts");
      if (kind(l) === "other" && !l.description.trim()) return toast("Give the other piece a name");
    }
    /* keep the "final price" note right when amounts change; other notes stay as they were */
    const gross = round2(keep.filter(l => kind(l) === "piece").reduce((t, l) => t + l.qty * price(l), 0)), total = round2(keep.reduce((t, l) => t + Number(l.amount), 0));
    const diff = round2(gross - total), onlyPieces = keep.every(l => kind(l) === "piece");
    const note = (old) => old && !/^Final price/.test(old) ? old : !onlyPieces ? (old || null) : diff > 0.004 ? `Final price ${RM(total)} (RM${diff.toFixed(2)} off)` : diff < -0.004 ? `Final price ${RM(total)}` : null;
    const patch = l => ({ payment_method: pay, amount: round2(Number(l.amount)), notes: note(l.r.notes),
      ...(kind(l) === "piece" ? { sku: l.sku, qty: l.qty, unit_price: price(l) } : kind(l) === "other" ? { description: l.description.trim(), qty: l.qty } : {}) });
    const now = new Date().toISOString();
    try {
      /* lines still waiting on this phone are fixed in the phone's outbox; sent ones in the database */
      let box = outbox();
      for (const l of drop) { if (l.r.id) await q(sb.from("sales").update({ deleted_at: now }).eq("id", l.r.id)); box = box.filter(r => r.client_id !== l.r.client_id); }
      for (const l of keep) { const p = patch(l); if (l.r.id) await q(sb.from("sales").update(p).eq("id", l.r.id)); box = box.map(r => r.client_id === l.r.client_id ? { ...r, ...p } : r); }
      setOutbox(box);
    } catch (e) { return fail(e); }
    await loadStock(); state.todayJson = null;
    toast(all ? "Sale removed. The pieces are back in stock." : "Sale updated");
    opts.done ? opts.done() : closeSheet();
  }
  draw();
}

function newMarketSheet() {
  const today = ymd(new Date());
  openSheet(`
    <h2 style="margin-top:0">New market</h2>
    <form id="f">
      <label class="field"><span>Market name</span><input name="name" required placeholder="Sulap Artisan"></label>
      <label class="field"><span>Venue</span><input name="venue" placeholder="Suria Sabah"></label>
      <p class="small muted" style="margin-top:-4px">Planned for later? Pick its dates. It waits under Upcoming until the first day.</p>
      <div class="two"><label class="field"><span>First day</span><input name="start" type="date" value="${today}"></label>
      <label class="field"><span>Last day</span><input name="end" type="date" value="${today}"></label></div>
      ${feeFields(null)}
      <button class="btn primary block" type="submit">Create market</button>
    </form>`, root => { followEnd(root); bindFeeFields(root); root.querySelector("#f").onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), fee = Number(f.get("fee")) || null;
      if (f.get("end") && f.get("start") && f.get("end") < f.get("start")) return toast("The last day is before the first day");
      const pay = readFeePay(root, fee, 0); if (pay === false) return;
      try {
        const [m] = await q(sb.from("locations").insert({ name: f.get("name").trim(), type: "market", venue: f.get("venue") || null, start_date: f.get("start") || null, end_date: f.get("end") || null, fee, fee_due_on: f.get("due") || null, active: true }).select());
        if (pay) await q(sb.from("expenses").insert({ spent_on: pay.on, expense_group: "Operating Expenses", category: "Market Fee", amount: pay.amount, description: feeDesc(m, pay.kind), paid_to: f.get("venue") || m.name, location_id: m.id }));
        state.locations.push(m); localSet("locations", state.locations); await loadMktPays(true);
        if (isUpcoming(m)) { closeSheet(); toast(`${m.name} added to upcoming markets${pay ? "" : " · not paid yet"}`); render(); return; }
        state.sellAt = m.id; localSet("sellAt", m.id);
        closeSheet(); toast("Market created. Bring stock next."); render();
      } catch (err) { fail(err); }
    }; });
}
/* booth fee: total, what's been paid so far (nothing / deposit / all), and when the rest is due */
function feeFields(m) {
  const today = ymd(new Date());
  return `<div class="card" style="padding:14px;margin:4px 0 14px">
      <label class="field"><span>Booth fee (RM)</span><input name="fee" type="number" step="0.01" min="0" inputmode="decimal" value="${m && m.fee != null ? m.fee : ""}"></label>
      ${m ? "" : `<label class="field"><span>Paid so far</span></label>
      <div class="chips" style="margin-top:-6px" id="paidHow"><button type="button" class="chip" data-ph="none" aria-pressed="true">Nothing yet</button><button type="button" class="chip" data-ph="deposit" aria-pressed="false">Deposit</button><button type="button" class="chip" data-ph="full" aria-pressed="false">Full fee</button></div>
      <div class="two" id="payRow" hidden><label class="field"><span id="payAmtL">Deposit (RM)</span><input name="payAmt" type="number" step="0.01" min="0" inputmode="decimal"></label>
      <label class="field"><span>Paid on</span><input name="payOn" type="date" value="${today}"></label></div>`}
      <label class="field" style="margin-bottom:0"><span>Pay the ${m ? "rest" : "fee or balance"} by (optional)</span><input name="due" type="date" value="${m && m.fee_due_on ? m.fee_due_on : ""}"></label>
    </div>`;
}
function bindFeeFields(root) {
  const how = root.querySelector("#paidHow"); if (!how) return;
  how.querySelectorAll("[data-ph]").forEach(b => b.onclick = () => {
    how.querySelectorAll("[data-ph]").forEach(c => c.setAttribute("aria-pressed", c === b)); how.dataset.v = b.dataset.ph;
    root.querySelector("#payRow").hidden = b.dataset.ph === "none";
    root.querySelector("#payAmtL").textContent = b.dataset.ph === "full" ? "Amount paid (RM)" : "Deposit (RM)";
    if (b.dataset.ph === "full") root.querySelector("[name=payAmt]").value = root.querySelector("[name=fee]").value;
  });
}
/* what was paid in the new-market form; null = nothing, false = something's wrong */
function readFeePay(root, fee, alreadyPaid) {
  const how = root.querySelector("#paidHow")?.dataset.v || "none";
  if (how === "none") return null;
  const amount = round2(Number(root.querySelector("[name=payAmt]").value) || 0), on = root.querySelector("[name=payOn]").value || ymd(new Date());
  if (amount <= 0) { toast("Type how much was paid"); return false; }
  if (fee && amount + alreadyPaid > fee + 0.004) { toast("That's more than the booth fee"); return false; }
  return { amount, on, kind: how === "deposit" && fee && amount < fee ? "deposit" : "" };
}
/* last day follows the first day when it would end up before it */
function followEnd(root) {
  const s = root.querySelector("[name=start]"), e = root.querySelector("[name=end]");
  s.addEventListener("change", () => { if (!e.value || e.value < s.value) e.value = s.value; });
}

/* ---------- upcoming markets: list, edit, cancel, bring stock ---------- */
function upcomingHtml() {
  const ups = upcomingMarkets();
  if (!ups.length) return "";
  return `<h2>Upcoming markets</h2><div class="list">${ups.map(m => { const n = stockTotalAt(m.id), days = Math.round((new Date(m.start_date + "T00:00") - new Date(ymd(new Date()) + "T00:00")) / 864e5);
    return `<div class="row" style="align-items:flex-start"><div class="grow"><div class="title" style="white-space:normal">${esc(m.name)}</div>
      <div class="small muted">${esc(marketDates(m))}${m.venue ? ` · ${esc(m.venue)}` : ""} · ${days === 1 ? "tomorrow" : `in ${days} days`}</div>
      <div class="small" style="margin-top:3px">${feeTag(m)}</div>
      <div class="small muted">${n ? `${n} pieces packed` : "Stock not packed yet"}</div>
      <div class="btns" style="margin:8px 0 0">${feeStatus(m).left > 0 ? `<button type="button" class="btn small" data-uppay="${m.id}">${feeStatus(m).key === "unpaid" ? "Pay booth fee" : "Pay balance"}</button>` : ""}<button type="button" class="btn small" data-upbring="${m.id}">Bring stock</button><button type="button" class="btn small" data-upedit="${m.id}">Edit</button></div></div></div>`; }).join("")}</div>
    <p class="small muted">On the first day, the Sell tab switches to the market by itself.</p>`;
}
function bindUpcoming(root) {
  root.querySelectorAll("[data-upbring]").forEach(b => b.onclick = () => bringStockSheet(loc(b.dataset.upbring)));
  root.querySelectorAll("[data-upedit]").forEach(b => b.onclick = () => editMarketSheet(loc(b.dataset.upedit)));
  root.querySelectorAll("[data-uppay]").forEach(b => b.onclick = () => payFeeSheet(loc(b.dataset.uppay)));
}
function feeTag(m) {
  const f = feeStatus(m), col = { green: "#3f9a83", peach: "#c46a33", rust: "#cc4b45" }[f.color] || "var(--muted)";
  return `<span style="color:${col};font-weight:600">${esc(f.label)}</span>`;
}
/* pay the deposit, the balance, or the whole fee */
function payFeeSheet(m) {
  const f = feeStatus(m);
  openSheet(`
    <h2>Pay booth fee · ${esc(m.name)}</h2>
    <p class="small muted" style="margin-top:-6px">${f.total ? `Booth fee ${RM(f.total)} · paid ${RM(f.paid)} · ${RM(f.left)} left` : "No booth fee set yet."}</p>
    <form id="f">
      ${f.total ? "" : `<label class="field"><span>Booth fee (RM)</span><input name="fee" type="number" step="0.01" min="0" inputmode="decimal" required></label>`}
      <div class="two"><label class="field"><span>Amount paid (RM)</span><input name="amt" type="number" step="0.01" min="0" inputmode="decimal" value="${f.left || ""}" required></label>
      <label class="field"><span>Paid on</span><input name="on" type="date" value="${ymd(new Date())}"></label></div>
      <p class="small muted" id="kindNote"></p>
      <button class="btn primary block" type="submit">Save payment</button>
    </form>`, root => {
    const total = () => f.total || Number(root.querySelector("[name=fee]")?.value) || 0;
    const kind = () => { const a = Number(root.querySelector("[name=amt]").value) || 0; return f.paid > 0.004 ? (a + f.paid < total() - 0.004 ? "part payment" : "balance") : a < total() - 0.004 ? "deposit" : ""; };
    const note = () => { const k = kind(); root.querySelector("#kindNote").textContent = k === "deposit" ? "Saved as the deposit. The market counts as confirmed." : k === "balance" ? "Saved as the balance. The booth fee will be fully paid." : k ? "Saved as a part payment." : "Saved as the full booth fee."; };
    root.querySelectorAll("input").forEach(i => i.addEventListener("input", note)); note();
    root.querySelector("#f").onsubmit = async e => {
      e.preventDefault(); const fd = new FormData(e.target), amt = round2(Number(fd.get("amt")) || 0), T = total();
      if (amt <= 0) return toast("Type how much was paid");
      if (T && amt + f.paid > T + 0.004) return toast(`That's more than the ${RM(f.left || T)} left`);
      try {
        if (!f.total) { await q(sb.from("locations").update({ fee: T }).eq("id", m.id)); m.fee = T; localSet("locations", state.locations); }
        await q(sb.from("expenses").insert({ spent_on: fd.get("on") || ymd(new Date()), expense_group: "Operating Expenses", category: "Market Fee", amount: amt, description: feeDesc(m, kind()), paid_to: m.venue || m.name, location_id: m.id }));
        await loadMktPays(); closeSheet(); toast(`${RM(amt)} booth fee saved`); render();
      } catch (err) { fail(err); }
    };
  });
}
function bringStockSheet(m) {
  const n = stockTotalAt(workshop().id);
  openSheet(`
    <h2>Bring stock to ${esc(m.name)}</h2>
    <p class="small muted" style="margin-top:-6px">${stockTotalAt(m.id) ? `${stockTotalAt(m.id)} pieces are there already. ` : ""}The workshop has ${n} pieces.</p>
    <button class="btn primary block" id="all" ${n ? "" : "disabled"}>Bring all workshop stock</button>
    <button class="btn block" id="some" style="margin-top:10px">Choose pieces</button>`, root => {
    root.querySelector("#all").onclick = () => bringAllSheet(m);
    root.querySelector("#some").onclick = () => moveSheet({ to: m.id, from: workshop()?.id, title: `Bring stock to ${m.name}` });
  });
}
function bringAllSheet(m) {
  const W = workshop().id, rows = state.products.map(p => ({ p, n: stockAt(W, p.sku) })).filter(x => x.n > 0);
  openSheet(`
    <h2>Bring all to ${esc(m.name)}</h2>
    <p>${rows.length ? `Move <b>${countWords(rows.map(x => ({ p: x.p, qty: x.n })))}</b> from the Workshop to ${esc(m.name)}?` : "The workshop has no stock to bring."}</p>
    <p class="small muted">When you end the market, whatever is left goes back to the workshop.</p>
    <button class="btn primary block" id="go" ${rows.length ? "" : "disabled"}>Move everything</button>`, root => root.querySelector("#go").onclick = async () => {
      try {
        await q(sb.from("stock_movements").insert(rows.map(x => ({ sku: x.p.sku, qty: x.n, from_location: W, to_location: m.id, reason: "transfer", moved_on: ymd(new Date()), ref: m.name }))));
        await loadStock(); closeSheet(); toast(`Workshop stock moved to ${m.name}`); render();
      } catch (e) { fail(e); }
    });
}
function editMarketSheet(m) {
  openSheet(`
    <h2>Edit ${esc(m.name)}</h2>
    <form id="f">
      <label class="field"><span>Market name</span><input name="name" required value="${esc(m.name)}"></label>
      <label class="field"><span>Venue</span><input name="venue" value="${esc(m.venue || "")}"></label>
      <div class="two"><label class="field"><span>First day</span><input name="start" type="date" required value="${m.start_date || ""}"></label>
      <label class="field"><span>Last day</span><input name="end" type="date" value="${m.end_date || ""}"></label></div>
      ${feeFields(m)}
      <button class="btn primary block" type="submit">Save</button>
    </form>
    <h3 style="margin:18px 0 6px">Booth fee payments</h3>
    <p class="small" style="margin:0 0 6px">${feeTag(m)}</p>
    <div class="list tight">${feePays(m).map(e => `<div class="row"><div class="grow"><div class="title small">${esc(e.description || "Payment")}</div><div class="small muted">${shortDate(e.spent_on)}</div></div><span class="num">${RM(e.amount)}</span><button type="button" class="link" data-rmpay="${e.id}" style="margin-left:10px">Remove</button></div>`).join("") || `<div class="small muted" style="padding:6px 2px">Nothing paid yet.</div>`}</div>
    ${feeStatus(m).left > 0 || !m.fee ? `<button class="btn block" id="pay" style="margin-top:10px">Add a payment</button>` : ""}
    <button class="btn danger block" id="cancel" style="margin-top:10px">Cancel this market</button>`, root => {
    if (root.querySelector("#pay")) root.querySelector("#pay").onclick = () => payFeeSheet(m);
    root.querySelectorAll("[data-rmpay]").forEach(b => b.onclick = async () => {
      if (!confirm("Remove this payment? It's taken out of expenses.")) return;
      try { await q(sb.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", Number(b.dataset.rmpay))); await loadMktPays(); toast("Payment removed"); editMarketSheet(m); } catch (err) { fail(err); }
    });
    followEnd(root);
    root.querySelector("#f").onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      if (f.get("end") && f.get("end") < f.get("start")) return toast("The last day is before the first day");
      const fee = f.get("fee") === "" ? null : round2(Number(f.get("fee")) || 0), paid = feeStatus(m).paid;
      if (fee != null && fee < paid - 0.004) return toast(`${RM(paid)} is already paid. The fee can't be less than that.`);
      const patch = { name: f.get("name").trim(), venue: f.get("venue") || null, start_date: f.get("start"), end_date: f.get("end") || f.get("start"), fee, fee_due_on: f.get("due") || null };
      try {
        await q(sb.from("locations").update(patch).eq("id", m.id));
        if (patch.name !== m.name) for (const e of feePays(m)) if ((e.description || "").startsWith(m.name)) await q(sb.from("expenses").update({ description: patch.name + e.description.slice(m.name.length) }).eq("id", e.id));
        await loadMktPays(true);
        Object.assign(m, patch); localSet("locations", state.locations); closeSheet(); toast("Market updated"); render(); } catch (err) { fail(err); }
    };
    root.querySelector("#cancel").onclick = () => cancelMarketSheet(m);
  });
}
function cancelMarketSheet(m) {
  const left = state.products.map(p => ({ p, n: stockAt(m.id, p.sku) })).filter(x => x.n > 0), f = feeStatus(m);
  openSheet(`
    <h2>Cancel ${esc(m.name)}?</h2>
    <p class="muted">It stays in your markets list, marked cancelled.${left.length ? ` The ${countWords(left.map(x => ({ p: x.p, qty: x.n })))} packed for it go back to the workshop.` : ""}</p>
    ${f.paid > 0.004 ? `<div class="card" style="padding:14px;margin:0 0 14px">
      <p class="small" style="margin:0 0 10px">You paid <b>${RM(f.paid)}</b> for the booth. How much did you get back?</p>
      <div class="chips" style="margin:0 0 10px" id="rf"><button type="button" class="chip" data-rf="0" aria-pressed="true">Nothing</button><button type="button" class="chip" data-rf="${f.paid}" aria-pressed="false">All ${RM(f.paid)}</button><button type="button" class="chip" data-rf="part" aria-pressed="false">Part of it</button></div>
      <div class="two"><label class="field"><span>Refund (RM)</span><input id="refund" type="number" step="0.01" min="0" max="${f.paid}" inputmode="decimal" value="0"></label>
      <label class="field"><span>Refunded on</span><input id="refundOn" type="date" value="${ymd(new Date())}"></label></div>
      <p class="small muted" style="margin:0">Whatever isn't refunded stays in expenses as money lost on this market.</p></div>` : ""}
    <button class="btn danger block" id="go">Cancel market</button>`, root => {
    root.querySelectorAll("[data-rf]").forEach(b => b.onclick = () => {
      root.querySelectorAll("[data-rf]").forEach(c => c.setAttribute("aria-pressed", c === b));
      const i = root.querySelector("#refund"); if (b.dataset.rf !== "part") i.value = b.dataset.rf; else { i.value = ""; i.focus(); }
    });
    root.querySelector("#go").onclick = async () => {
      const refund = round2(Number(root.querySelector("#refund")?.value) || 0), on = root.querySelector("#refundOn")?.value || ymd(new Date());
      if (refund < 0 || refund > f.paid + 0.004) return toast(`The refund can be up to ${RM(f.paid)}`);
      try {
        if (left.length) await q(sb.from("stock_movements").insert(left.map(x => ({ sku: x.p.sku, qty: x.n, from_location: m.id, to_location: workshop().id, reason: "return", moved_on: ymd(new Date()), ref: m.name, notes: "Market cancelled" }))));
        if (refund > 0) await q(sb.from("expenses").insert({ spent_on: on, expense_group: "Operating Expenses", category: "Market Fee", amount: -refund, description: feeDesc(m, "refund"), paid_to: m.venue || m.name, location_id: m.id }));
        const today = ymd(new Date());
        await q(sb.from("locations").update({ active: false, cancelled_on: today }).eq("id", m.id));
        m.active = false; m.cancelled_on = today; localSet("locations", state.locations);
        if (String(state.sellAt) === String(m.id)) { state.sellAt = null; localSet("sellAt", null); }
        await loadMktPays(true); await loadStock(); closeSheet(); toast(`${m.name} cancelled${refund > 0 ? ` · ${RM(refund)} refund saved` : ""}`); render();
      } catch (e) { fail(e); }
    };
  });
}

function endMarketSheet(m) {
  const left = activeProducts().map(p => ({ p, n: stockAt(m.id, p.sku) })).filter(x => x.n > 0);
  openSheet(`
    <h2 style="margin-top:0">End ${esc(m.name)}</h2>
    <p class="muted">${left.length ? `${left.reduce((t, x) => t + x.n, 0)} pieces go back to the workshop.` : "No stock left at this market."} The market moves to your history.</p>
    ${outbox().length ? `<p class="tag brass" style="display:inline-block">Some sales are still on this phone. Connect to sync them first.</p>` : ""}
    <button class="btn primary block" id="go">End market</button>`, root => root.querySelector("#go").onclick = async () => {
      if (outbox().length) return toast("Sync the sales on this phone first.");
      try {
        if (left.length) await q(sb.from("stock_movements").insert(left.map(x => ({ sku: x.p.sku, qty: x.n, from_location: m.id, to_location: workshop().id, reason: "return", ref: m.name }))));
        await q(sb.from("locations").update({ active: false }).eq("id", m.id));
        m.active = false; state.sellAt = null; localSet("sellAt", null);
        await loadStock(); closeSheet(); toast("Market ended. Stock is back at the workshop."); render();
      } catch (e) { fail(e); }
    });
}

/* =========================================================
   RETAILERS
   ========================================================= */
async function renderRetailers() {
  const view = $("#view");
  let owed = localGet("owed", {});
  const draw = () => {
    const rs = retailers(), G = ["g-sky", "g-sunset", "g-sea", "g-coral", "g-mint", "g-dusk"];
    const card = (r, i) => `<button class="pcard ${G[i % G.length]}${i % 4 === 0 || i % 4 === 3 ? " tall" : ""} retailer-card" data-open="${r.id}">${i % 4 === 0 ? '<span class="sun"></span>' : ""}
      <div><div class="pc-title">${esc(r.name)}</div><span class="pc-pill">${esc(r.code || "")} · ${Math.round(Number(r.commission_rate) * 100)}%</span></div>
      <div><div class="pc-big">${stockTotalAt(r.id)}<span style="font-size:12px;font-weight:500"> pieces</span></div><div class="pc-sub">${owed[r.id] ? `Owes you ${RM(owed[r.id])}` : "Nothing owed"}</div></div></button>`;
    view.innerHTML = `<h1 class="big">Your<br>retailers</h1>
    <div class="masonry"><div class="mcol">${rs.filter((_, i) => i % 2 === 0).map((r) => card(r, rs.indexOf(r))).join("")}</div><div class="mcol">${rs.filter((_, i) => i % 2 === 1).map(r => card(r, rs.indexOf(r))).join("")}
      <button class="pcard g-mint" id="addR2" style="min-height:120px"><div class="pc-title">+ Add a<br>retailer</div><div class="pc-sub">Another shop that stocks Apolaki</div></button></div></div>
    `;
    view.querySelectorAll("[data-open]").forEach(c => c.onclick = () => openRetailer(Number(c.dataset.open)));
    $("#addR2").onclick = () => openSheet(`
      <h2>Add a retailer</h2>
      <form id="f"><label class="field"><span>Shop name</span><input name="name" required></label>
      <div class="two"><label class="field"><span>Short code</span><input name="code" required maxlength="6" placeholder="TAA"></label>
      <label class="field"><span>Commission %</span><input name="rate" type="number" step="0.1" min="0" max="100" value="35"></label></div>
      <button class="btn primary block">Add retailer</button></form>`, root => root.querySelector("#f").onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target);
        try { const [r] = await q(sb.from("locations").insert({ name: f.get("name").trim(), type: "retailer", code: f.get("code").trim().toUpperCase(), commission_rate: (Number(f.get("rate")) || 0) / 100 }).select());
          state.locations.push(r); closeSheet(); toast("Retailer added"); render(); } catch (err) { fail(err); }
      });
  };
  draw();
  try {
    const rows = await q(sb.from("payouts").select("location_id,net_amount").eq("paid", false));
    const o = {}; rows.forEach(p => o[p.location_id] = (o[p.location_id] || 0) + Number(p.net_amount));
    if (JSON.stringify(o) !== JSON.stringify(owed)) { owed = o; localSet("owed", o); if (state.tab === "retailers" && $("#sheet").hidden) draw(); }
  } catch {}
}

/* =========================================================
   ONE RETAILER — laid out like the ART ATTIC sheet
   ========================================================= */
function openRetailer(id) { state.retailerId = id; state.rTab = state.rTab || "dash"; go("retailer"); }

async function loadRetailerData(r) {
  const key = "rdata:" + r.id;
  try {
    const [sales, moves, pays] = await Promise.all([
      q(live("sales", "sale_month,sold_at,report_id,sku,qty,unit_price,amount,notes").eq("location_id", r.id).eq("channel", "retailer").order("sold_at")),
      q(sb.from("stock_movements").select("moved_on,sku,qty,from_location,to_location,reason,ref,notes,created_at").or(`to_location.eq.${r.id},from_location.eq.${r.id}`).order("moved_on")),
      q(sb.from("payouts").select("period_month,net_amount,paid,paid_on,paid_amount,report_stage,due_on").eq("location_id", r.id).order("period_month"))
    ]);
    const d = { sales, moves, pays }; localSet(key, d); return d;
  } catch (e) { throw e; }
}

const MONTH = 30.4375 * 864e5;
const fmtMonth = s => monthStart(s.slice(0, 7)).toLocaleDateString("en-MY", { month: "short", year: "numeric" });
const pct = x => x == null || !isFinite(x) ? "—" : Math.round(x * 100) + "%";
const dec = (x, n = 1) => x == null || !isFinite(x) ? "—" : Number(x).toFixed(n);

/* CLASSIFY-START
   Product classification, per item per retailer. Review period = the last 4 complete calendar months (this month left out).
   Sales pace = units sold ÷ days in stock × 30. Days in stock come from deliveries and the monthly sales reports only:
   a day counts as "surely in stock" when stock was above zero even if every piece sold that month had gone before that day,
   and "maybe in stock" when stock was above zero before that month's sales. We never guess the day an item sold out;
   if the answer depends on it, the item is "Needs review". Sell-through and current stock are not used here. */
const CLASS_INFO = {
  new: { label: "New / Testing", tone: "" }, review: { label: "Needs review", tone: "brass" }, dormant: { label: "Dormant", tone: "rust" },
  core: { label: "Core", tone: "green" }, promising: { label: "Promising", tone: "brass" }, slow: { label: "Slow-moving", tone: "rust" },
  thin: { label: "Insufficient availability", tone: "" }, notstocked: { label: "Not stocked", tone: "" }, status: { label: "", tone: "" }
};
const CLASS_ORDER = ["core", "promising", "slow", "dormant", "new", "thin", "review", "notstocked", "status"];
const dUTC = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const isoUTC = t => new Date(t).toISOString().slice(0, 10);
const addMonths = (m, n) => { const d = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const MON_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monName = (m, yr) => MON_SHORT[+m.slice(5, 7) - 1] + (yr ? " " + m.slice(0, 4) : "");
const span = ms => `${monName(ms[0])}–${monName(ms[ms.length - 1], true)}`;
const n1 = x => (Math.floor(x * 100 + 1e-9) / 100).toFixed(2);
/* "about 2.5 a month"; two decimals when rounding would cross a class line (0.98 must not read as 1.0) */
const paceWords = x => { const r = Math.round(x * 10) / 10; return [1, 2].some(t => (x < t) !== (r < t)) ? n1(x) : r.toFixed(1); };
const dayName = d => `${+d.slice(8, 10)} ${MON_SHORT[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}`;

/* opts: { status, locId, moves:[{moved_on,qty,to_location,from_location,reason}], sales:[{month:'YYYY-MM',qty}], finalMonths:Set('YYYY-MM'), today:'YYYY-MM-DD' } */
function classifyItem(o) {
  const cur = o.today.slice(0, 7), months = [1, 2, 3, 4].map(i => addMonths(cur, -5 + i)), last3 = months.slice(1);
  const pStart = months[0] + "-01", pEnd = isoUTC(Date.UTC(+cur.slice(0, 4), +cur.slice(5, 7) - 1, 0));
  /* why = what the numbers say, in plain words; next = what to do about it */
  const out = (key, why, next, extra = {}) => ({ key, label: key === "status" ? o.status : (extra.likely ? "Likely " : "") + CLASS_INFO[key].label, tone: CLASS_INFO[key].tone, why, next, months, ...extra });
  if (o.status && o.status !== "Active") return out("status", `This item is ${o.status.toLowerCase()}.`,
    o.status === "Paused" ? "Don't restock while it's paused." : o.status === "Replaced" ? "Sell what's left, then send the new version instead." : "Don't restock. Sell what's left or take it back.");
  const moves = o.moves.filter(m => m.to_location === o.locId || m.from_location === o.locId);
  const deliveries = moves.filter(m => m.to_location === o.locId && m.reason !== "correction").map(m => m.moved_on).sort();
  const soldIn = m => o.sales.filter(s => s.month === m).reduce((t, s) => t + (s.qty || 0), 0);
  if (!deliveries.length) return o.sales.length ? out("review", "There are sales for this item here, but no delivery on record.", "Add the delivery under Send stock (with the right date) so the numbers add up.") : out("notstocked", "Never sent to this shop.", "Send some if you'd like to try it here.");
  const first = deliveries[0];
  /* 1. New / Testing: complete calendar months since the first delivery, up to the end of the review period */
  let firstFull = first.slice(0, 7); if (first.slice(8, 10) !== "01") firstFull = addMonths(firstFull, 1);
  const fullMonths = []; for (let m = firstFull; m <= months[3]; m = addMonths(m, 1)) fullMonths.push(m);
  const reliable = fullMonths.filter(m => o.finalMonths.has(m));
  if (fullMonths.length < 3) { const ready = addMonths(firstFull, 3);
    return out("new", `First sent on ${dayName(first)}, so it has only been there ${fullMonths.length ? `${fullMonths.length} full month${fullMonths.length === 1 ? "" : "s"}` : "less than a full month"}. It needs 3 full months to judge fairly.`,
      `Give it time and keep it on the shelf. It gets a proper class from ${monName(ready, true)}.`); }
  if (reliable.length < 3) return out("review", `Only ${reliable.length} of its ${fullMonths.length} full months have an end-of-month sales report.`, "Upload the missing end-of-month sales reports.");
  /* missing reports in the review period: never treated as zero sales */
  const missing = months.filter(m => m >= first.slice(0, 7) && !o.finalMonths.has(m));
  if (missing.length) return out("review", `There's no end-of-month sales report for ${missing.map(m => monName(m, true)).join(", ")}, so we can't tell what sold.`, `Upload the ${missing.map(m => monName(m)).join(" and ")} end-of-month report.`);
  /* 2. rebuild stock day by day through the review period */
  const net = d => moves.filter(m => m.moved_on <= d).reduce((t, m) => t + (m.to_location === o.locId ? m.qty : -m.qty), 0);
  const soldBefore = m => o.sales.filter(s => s.month < m).reduce((t, s) => t + (s.qty || 0), 0);
  let sure = 0, maybe = 0, sure3 = 0, maybe3 = 0;
  const per = {};
  for (const m of months) {
    const sold = soldIn(m), base = soldBefore(m);
    const endLevel = net(isoUTC(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0))) - base - sold;
    if (endLevel < 0) return out("review", `The numbers don't add up: more were sold than were sent by the end of ${monName(m, true)} (${endLevel} left).`, "Check the deliveries and their dates, or do a stock count with the shop.");
    let s = 0, mb = 0;
    for (let t = dUTC(m + "-01"); isoUTC(t).slice(0, 7) === m; t += 864e5) {
      const up = net(isoUTC(t)) - base;
      if (up - sold > 0) s++;
      if (up > 0) mb++;
    }
    per[m] = { sold, sure: s, maybe: mb, end: endLevel };
    sure += s; maybe += mb; if (last3.includes(m)) { sure3 += s; maybe3 += mb; }
  }
  const units = months.reduce((t, m) => t + per[m].sold, 0), units3 = last3.reduce((t, m) => t + per[m].sold, 0);
  const salesMonths = months.filter(m => per[m].sold > 0).length;
  const facts = { units, salesMonths, daysSure: sure, daysMaybe: maybe, per, first };
  /* 3. Dormant: nothing sold in the last 3 complete months despite 60+ days in stock (no sales → no doubt about stock days) */
  if (units3 === 0 && sure3 >= 60) return out("dormant", `Nothing sold from ${span(last3)}, even though it was on the shelf for ${sure3} days.`,
    "Don't send more. Ask the shop to move it somewhere more visible, or take some back to sell at a market. If it still doesn't sell, think about a discount or stopping it.", { ...facts });
  /* 4–6, worked out with the surest and the widest count of days in stock */
  const judge = days => {
    if (days < 60) return { key: "thin" };
    const pace = units / days * 30;
    return { key: salesMonths >= 3 && pace >= 2 ? "core" : pace >= 1 ? "promising" : "slow", pace };
  };
  const a = judge(sure), b = judge(maybe);   /* a: fewest possible days on the shelf (fastest pace); b: most days (slowest pace) */
  const per4 = `${span(months)}: ${units} sold`;
  const ranOut = months.filter(m => per[m].sure < per[m].maybe).map(m => monName(m));
  const oftenOut = maybe < 100;   /* was off the shelf for weeks of the period */
  const NEXT = {
    core: "A best seller here. Keep it on the shelf all the time: restock before it runs out.",
    promising: salesMonths < 3 ? "Sells well but not every month. Keep 1–2 on the shelf and see if it picks up." : "Selling steadily. Keep a few on the shelf and check again next month.",
    slow: "Sells slowly here. Don't send more for now. Try a better spot in the shop or a post online, or sell it at a market instead."
  };
  if (b.key === "thin") return out("thin", `${per4}, but it was only on the shelf ${sure === maybe ? sure : `${sure}–${maybe}`} days. That's too short to judge (needs 60).`,
    units ? "It sells, but keeps running out. Send more so it stays on the shelf, then we can judge it properly." : "Keep it on the shelf for a while so we can see how it sells.", facts);
  if (a.key !== b.key) {
    /* the sold-out day isn't in the reports; the slowest possible pace still gives a class, and the real one can only be the same or better */
    return out(b.key, `${per4}. It ran out in ${ranOut.join(" and ") || "the period"} and the report doesn't say which day, so it sold at least ${paceWords(b.pace)} a month, maybe more.`,
      (b.key === "slow" ? "It may sell better than this. Keep it on the shelf for a month without running out, then check again." : "It sells fast and ran out. Send more so it doesn't run out again."),
      { ...facts, likely: true, pace: b.pace, paceHi: a.pace ?? null });
  }
  const months4 = b.key === "core" ? ` It sold in ${salesMonths} of the 4 months.` : b.key === "promising" && salesMonths < 3 ? ` But it only sold in ${salesMonths} of the 4 months.` : "";
  const shelf = ranOut.length ? `${sure}–${maybe}` : `${maybe}`;
  return out(b.key, `${per4} in ${shelf} days on the shelf, about ${paceWords(b.pace)} a month.${months4}`,
    NEXT[b.key] + (oftenOut && b.key !== "slow" ? " It was off the shelf for part of this time, so send stock sooner." : ""), { ...facts, pace: b.pace, paceHi: a.pace });
}
/* CLASSIFY-END */

/* per-item numbers, same idea as the sheet's Product Analysis (with the fixes you asked for) */
function analyseRetailer(r, d) {
  const rate = Number(r.commission_rate) || 0, today = new Date(), curM = ym(today);
  const skus = new Set([...state.codes.filter(c => c.location_id === r.id).map(c => c.sku), ...d.sales.map(s => s.sku), ...d.moves.map(m => m.sku)].filter(Boolean));
  const items = [];
  /* months with a final (whole-month) sales report: a final payout, or report lines not marked mid-month */
  const finalMonths = new Set([...(d.pays || []).filter(x => x.report_stage !== "mid").map(x => x.period_month.slice(0, 7)),
    ...d.sales.filter(s => s.report_id && s.notes !== "Mid-month report").map(s => (s.sale_month || s.sold_at).slice(0, 7))]);
  const todayIso = ymd(today);
  /* sizes of one design count as one item for classification (same grouping as the Sell tab) */
  const groupOf = {};
  for (const g of sizeGroups([...skus].map(prod).filter(Boolean), r.id)) {
    const ps = g.items.map(it => it.p), set = new Set(ps.map(p => p.sku));
    const status = ps.some(p => p.status === "Active") ? "Active" : ["Paused", "Replaced", "Discontinued"].find(x => ps.some(p => p.status === x)) || ps[0].status;
    const c = classifyItem({ status, locId: r.id, today: todayIso, finalMonths, moves: d.moves.filter(m => set.has(m.sku)),
      sales: d.sales.filter(s => set.has(s.sku)).map(s => ({ month: (s.sale_month || s.sold_at).slice(0, 7), qty: s.qty || 0 })) });
    const sizes = g.items.map(it => it.size).filter(Boolean);
    if (ps.length > 1 && c.key !== "status") c.why = `Counting all sizes (${sizes.join(", ")}) together. ${c.why}`;
    const info = { key: g.key, name: g.name, skus: ps.map(p => p.sku), sizes, cls: c };
    g.items.forEach(it => groupOf[it.p.sku] = { ...info, size: it.size });
  }
  for (const sku of skus) {
    const p = prod(sku); if (!p) continue;
    const ins = d.moves.filter(m => m.sku === sku && m.to_location === r.id && (m.reason === "restock" || m.reason === "transfer"));
    const sl = d.sales.filter(s => s.sku === sku);
    const stockIn = ins.reduce((t, m) => t + m.qty, 0);
    const sold = sl.reduce((t, s) => t + (s.qty || 0), 0);
    const actual = sl.reduce((t, s) => t + Number(s.amount), 0);
    const price = shopPrice(r.id, sku);
    const gross = sold * price;
    const current = stockAt(r.id, sku);
    const first = ins.length ? ins[0].moved_on : null;
    const monthsAvail = first ? Math.max(0, (today - new Date(first + "T00:00")) / MONTH) : 0;
    const fullMonths = Math.max(1, Math.floor(monthsAvail));
    const months = sl.map(s => (s.sale_month || s.sold_at).slice(0, 7)).sort();
    const firstSale = months[0] || null, lastSale = months[months.length - 1] || null;
    const sinceLast = lastSale ? (today.getFullYear() - +lastSale.slice(0, 4)) * 12 + today.getMonth() + 1 - +lastSale.slice(5, 7) : null;
    const velocity = sold / fullMonths;
    const cover = velocity > 0 ? current / velocity : null;
    const st = sold + current > 0 ? sold / (sold + current) : null;
    const restocks = new Set(ins.map(m => m.ref || m.moved_on)).size;
    const stage = !first ? "Not stocked" : monthsAvail < 2 ? "Too New" : monthsAvail < 4 ? "New" : "Mature";
    const group = groupOf[sku] || { key: "sku|" + sku, name: p.name, skus: [sku], sizes: [], size: "" };
    /* a size that is paused/replaced/discontinued keeps its own status; otherwise it carries its design's class */
    const cls = p.status !== "Active" || !group.cls ? classifyItem({ status: p.status, locId: r.id, today: todayIso, finalMonths, moves: [], sales: [] }) : group.cls;
    const movement = !sold ? "Never Sold" : sinceLast >= 3 ? "Dormant" : sinceLast <= 1 ? "Moving" : "Slowing";
    const { stockStatus, action } = stockAdvice({ status: p.status, stage, current, sold, cover, movement, monthsAvail, slow: cls.key === "slow", oneSize: group.skus.length > 1 });
    items.push({ p, sku, code: codeAt(r.id, sku), stockIn, sold, actual, gross, net: actual * (1 - rate), current, value: current * price, price,
      first, monthsAvail, firstSale, lastSale, sinceLast, velocity, cover, st, restocks, stage, cls, group, movement, stockStatus, action,
      realisation: gross ? actual / gross : null });
  }
  /* one shop code for all sizes: the shop can't say which size sold, so stock and advice are for the design as a whole */
  const byCode = {};
  items.forEach(i => { const k = sharedKey(r.id, i.sku); if (k.startsWith("g:")) (byCode[k] = byCode[k] || []).push(i); });
  for (const [key, its] of Object.entries(byCode)) {
    its.sort((a, b) => sizeRank(a.sku) - sizeRank(b.sku));
    const T = k => its.reduce((t, i) => t + i[k], 0), current = T("current"), sold = T("sold");
    const firstIn = its.map(i => i.first).filter(Boolean).sort()[0] || null, monthsAvail = Math.max(...its.map(i => i.monthsAvail));
    const velocity = sold / Math.max(1, Math.floor(monthsAvail)), cover = velocity > 0 ? current / velocity : null;
    const lastSale = its.map(i => i.lastSale).filter(Boolean).sort().pop() || null;
    const sinceLast = lastSale ? (today.getFullYear() - +lastSale.slice(0, 4)) * 12 + today.getMonth() + 1 - +lastSale.slice(5, 7) : null;
    const movement = !sold ? "Never Sold" : sinceLast >= 3 ? "Dormant" : sinceLast <= 1 ? "Moving" : "Slowing";
    const stage = !firstIn ? "Not stocked" : monthsAvail < 2 ? "Too New" : monthsAvail < 4 ? "New" : "Mature";
    const status = its.some(i => i.p.status === "Active") ? "Active" : its[0].p.status;
    const adv = stockAdvice({ status, stage, current, sold, cover, movement, monthsAvail, slow: its[0].cls.key === "slow", oneSize: false });
    const code = codeAt(r.id, its[0].sku);
    const shared = { key, code, skus: its.map(i => i.sku), sizes: its.map(i => sizeShort(i.p.size) || i.p.size || ""), name: nice(baseName(its[0].p.name)),
      current, sold, stockIn: T("stockIn"), value: T("value"), actual: T("actual"), velocity, cover, ...adv };
    its.forEach(i => i.shared = shared);
  }
  items.sort((a, b) => String(a.code || "~" + a.p.name).localeCompare(String(b.code || "~" + b.p.name)));
  return items;
}
function stockAdvice({ status, stage, current, sold, cover, movement, monthsAvail, slow, oneSize }) {
  const stockStatus = current <= 0 ? (sold ? "Sold Out" : "No Stock") : !sold ? "No Sales Yet" : cover < 1 ? "Low" : cover > 6 ? "Overstocked" : "Healthy";
  let action;
  if (status === "Replaced") action = current > 0 ? "Clear Remaining Stock" : "Use Replacement";
  else if (status === "Paused") action = "Hold - Paused";
  else if (status === "Discontinued") action = current > 0 ? "Clear Remaining Stock" : "Retired";
  else if (stage === "Too New") action = "Monitor New Product";
  else if (current <= 0 && sold > 0) action = "Priority Restock";
  else if (cover != null && cover < 1) action = "Priority Restock";
  else if (cover != null && cover < 2) action = "Restock Small Batch";
  else if (monthsAvail >= 3 && (movement === "Dormant" || movement === "Never Sold")) action = oneSize ? "Review Size" : "Review Design";   /* one size not selling; the design is judged as a whole */
  else if (slow) action = "Monitor Product";
  else action = "Hold Restock";
  return { stockStatus, action };
}
/* for shop screens: sizes that share one shop code shown as one line with the design's totals */
function collapseShared(items) {
  const seen = new Set(), out = [];
  for (const i of items) {
    if (!i.shared) { out.push(i); continue; }
    if (seen.has(i.shared.key)) continue; seen.add(i.shared.key);
    const x = i.shared, lead = items.find(y => y.sku === x.skus[0]) || i;
    out.push({ ...lead, sku: lead.sku, p: { ...lead.p, name: `${x.name} (all sizes)` }, current: x.current, sold: x.sold, stockIn: x.stockIn, value: x.value, actual: x.actual,
      velocity: x.velocity, cover: x.cover, action: x.action, stockStatus: x.stockStatus, sharedRow: true });
  }
  return out;
}

const ACTION_TONE = { "Priority Restock": "rust", "Restock Small Batch": "brass", "Clear Remaining Stock": "brass", "Review Design": "brass", "Review Size": "brass", "Use Replacement": "", "Hold - Paused": "", "Retired": "", "Monitor New Product": "green", "Monitor Product": "", "Hold Restock": "green" };
const clsTag = i => tag(i.cls.label, i.cls.tone);
const tag = (t, tone) => `<span class="tag ${tone || ""}">${esc(t)}</span>`;
const codeChip = it => it.code ? `<span class="code">${esc(it.code)}</span>` : usesCodes(loc(state.retailerId)) ? `<span class="code none">No code</span>` : "";

async function renderRetailer() {
  const view = $("#view"), r = loc(state.retailerId);
  if (!r) return go("retailers");
  const tabs = [["dash", "Dashboard"], ["stock", "Stock"], ["in", "Stock in"], ["sales", "Sales"], ["analysis", "Analysis"]];
  const owed = localGet("owed", {})[r.id] || 0;
  const IC = { box: '<path d="M3 7l9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10"/>', coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5c0-1 1.1-1.5 2.5-1.5s2.5.6 2.5 1.6-1.1 1.4-2.5 1.7-2.5.7-2.5 1.7 1.1 1.6 2.5 1.6 2.5-.5 2.5-1.5"/>', pct: '<path d="M19 5 5 19M7 7h.01M17 17h.01"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="17" r="2"/>' };
  const st = (k, t) => `<span><svg viewBox="0 0 24 24">${IC[k]}</svg>${t}</span>`;
  const head = () => `
    <div class="detail">
      <div class="detail-hero g-sky"><span class="sun"></span>
        <button class="back" id="back"><svg viewBox="0 0 8 13"><path d="M6.5 1.5 1.5 6.5 6.5 11.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg> Retailers</button>
      </div>
      <div class="detail-panel">
        <span class="fav">${esc((r.code || "").slice(0, 3))}</span>
        <h1>${esc(r.name)}</h1>
        <div class="stats">${st("box", `${stockTotalAt(r.id)} pieces`)}${st("coin", (() => { const u = (state.rPays || []).filter(p => !p.paid); if (!u.length) return owed ? `${RM(owed)} owed` : "Nothing owed"; const n = u[0], late = n.due_on && n.due_on < ymd(new Date()); return `${RM(u.reduce((t, p) => t + Number(p.net_amount), 0))} owed · ${late ? "<b style='color:var(--rust)'>overdue</b> since" : "next due"} ${shortDate(n.due_on || dueDate(n.period_month.slice(0, 7)))}`; })())}${st("pct", `${Math.round(Number(r.commission_rate) * 100)}% commission`)}</div>
        <div class="detail-actions"><button class="btn" data-a="paste">Sales report</button><button class="btn" data-a="send">Send stock</button><button class="btn" data-a="tally">Stock report</button><button class="btn" data-a="pay">Payouts</button></div>
      </div>
      <div class="detail-body">
        <div class="ttabs">${tabs.map(([k, l]) => `<button data-rt="${k}" aria-pressed="${state.rTab === k}">${l}</button>`).join("")}</div>`;
  const bindHead = () => {
    $("#back").onclick = () => go("retailers");
    view.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => { state.rTab = b.dataset.rt; state.rFilter = null; renderRetailer(); });
    view.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ paste: pasteSalesSheet, tally: tallySheet, pay: payoutsSheet, send: sendStockSheet, codes: toggleCodes, store: storeListSheet })[b.dataset.a](r));
  };
  const draw = d => {
    state.rPays = d.pays || [];
    const items = analyseRetailer(r, d);
    const body = { dash: rDashboard, stock: rStock, in: rStockIn, sales: rSales, analysis: rAnalysis }[state.rTab](r, d, items);
    const open = [...view.querySelectorAll("details[data-key][open]")].map(e => e.dataset.key);
    view.innerHTML = head() + body + "</div></div>";
    view.querySelectorAll("details[data-key]").forEach(e => { if (open.includes(e.dataset.key)) e.open = true; });
    bindHead();
    view.querySelectorAll("[data-item]").forEach(e => e.onclick = ev => { ev.preventDefault(); itemAtRetailerSheet(r, items.find(i => i.sku === e.dataset.item)); });
    /* switching sub-tabs, filters and months redraws from memory: no waiting, no jump */
    view.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => { state.rTab = b.dataset.rt; state.rFilter = null; draw(d); });
    view.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { state.rFilter = b.dataset.f; draw(d); });
    view.querySelectorAll("[data-mon]").forEach(b => b.onclick = () => { state.rMonth = b.dataset.mon; draw(d); });
  };
  const cached = localGet("rdata:" + r.id, null);
  if (cached) draw(cached); else { view.innerHTML = head() + SKEL + "</div></div>"; bindHead(); }
  try {
    const d = await loadRetailerData(r);
    if (state.tab !== "retailer" || state.retailerId !== r.id) return;
    if (!cached || JSON.stringify(d) !== JSON.stringify(cached)) draw(d);
  } catch { if (!cached) { view.innerHTML = head() + `<div class="warn-banner">You're offline. Connect to see ${esc(r.name)}'s records.</div></div></div>`; bindHead(); } }
}

function rDashboard(r, d, items) {
  items = collapseShared(items);
  const rate = Number(r.commission_rate) || 0;
  const actual = items.reduce((t, i) => t + i.actual, 0), units = items.reduce((t, i) => t + i.sold, 0);
  const stock = items.reduce((t, i) => t + Math.max(0, i.current), 0), value = items.reduce((t, i) => t + Math.max(0, i.value), 0);
  const active = items.filter(i => i.p.status === "Active").length;
  const year = new Date().getFullYear();
  const byM = {};
  d.sales.forEach(s => { const m = (s.sale_month || s.sold_at).slice(0, 7); const o = byM[m] = byM[m] || { u: 0, a: 0 }; o.u += s.qty || 0; o.a += Number(s.amount); });
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`);
  const maxA = Math.max(1, ...months.map(m => byM[m]?.a || 0));
  const counts = {}; items.forEach(i => counts[i.action] = (counts[i.action] || 0) + 1);
  const order = ["Priority Restock", "Restock Small Batch", "Hold Restock", "Monitor New Product", "Monitor Product", "Review Design", "Review Size", "Clear Remaining Stock", "Hold - Paused", "Use Replacement", "Retired"];
  const topU = items.filter(i => i.sold).sort((a, b) => b.sold - a.sold).slice(0, 10);
  const topA = items.filter(i => i.actual).sort((a, b) => b.actual - a.actual).slice(0, 10);
  const top5 = actual ? topA.slice(0, 5).reduce((t, i) => t + i.actual, 0) / actual : 0;
  const cats = {}; items.forEach(i => { const k = i.p.category || "Other"; const c = cats[k] = cats[k] || { u: 0, a: 0, s: 0 }; c.u += i.sold; c.a += i.actual; c.s += Math.max(0, i.current); });
  const nameCell = i => `<td>${codeChip(i)} ${esc(i.p.name)}</td>`;
  return `
    <div class="figures">
      <div class="figure lead"><div class="label">Total actual sales</div><div class="value">${RM(actual)}</div></div>
      <div class="figure"><div class="label">Net sales proceeds</div><div class="value">${RM(actual * (1 - rate))}</div></div>
      <div class="figure"><div class="label">Total units sold</div><div class="value">${units}</div></div>
      <div class="figure"><div class="label">Overall sell-through</div><div class="value">${pct(units + stock ? units / (units + stock) : null)}</div></div>
      <div class="figure"><div class="label">Current stock</div><div class="value">${stock}</div></div>
      <div class="figure"><div class="label">Current stock value</div><div class="value">${RM(value)}</div></div>
      <div class="figure"><div class="label">Active items</div><div class="value">${active}</div></div>
    </div>
    <h2>Monthly performance ${year}</h2>
    <div class="card compact">
      <div class="bars" style="height:120px;margin:0 0 6px">${months.map(m => `<div class="bar ${m === ym(new Date()) ? "now" : ""}"><i style="height:${Math.max(3, (byM[m]?.a || 0) / maxA * 100)}%"></i><span>${monthStart(m).toLocaleDateString("en-MY", { month: "narrow" })}</span></div>`).join("")}</div>
      <div class="scroll-x"><table class="simple"><tr><th>Month</th><th class="r">Units</th><th class="r">Actual</th><th class="r">Net</th><th class="r">Avg</th></tr>
      ${months.filter(m => byM[m]).map(m => { const o = byM[m]; return `<tr><td>${monthStart(m).toLocaleDateString("en-MY", { month: "short" })}</td><td class="r">${o.u}</td><td class="r">${RM(o.a)}</td><td class="r">${RM(o.a * (1 - rate))}</td><td class="r">${o.u ? "RM" + Math.round(o.a / o.u) : "—"}</td></tr>`; }).join("") || `<tr><td colspan="5" class="muted">No sales this year yet.</td></tr>`}</table></div>
    </div>
    <h2>Action table</h2>
    ${order.filter(a => counts[a]).map(a => { const list = items.filter(i => i.action === a).sort((x, y) => (x.cover ?? 99) - (y.cover ?? 99) || y.sold - x.sold); return `
    <details class="group" data-key="act:${esc(a)}"><summary>${tag(a, ACTION_TONE[a])}<span class="grow"></span><span class="count">${counts[a]}</span>${CHEV}</summary>
      <div class="inner">${list.map(i => `<div class="row" data-item="${i.sku}"><div class="grow"><div class="title" style="white-space:normal">${esc(i.p.name)}</div>
        <div class="small muted">${codeChip(i)} Stock ${i.current} · Sold ${i.sold} · ${dec(i.velocity)}/mo${i.cover != null ? ` · ${dec(i.cover)} mo cover` : ""}</div></div>${clsTag(i)}</div>`).join("")}</div>
    </details>`; }).join("")}
    <h2>Top 10 · units sold</h2>
    <div class="card scroll-x"><table class="simple"><tr><th>Item</th><th class="r">Units</th><th class="r">Sold/mo</th><th class="r">Sell-through</th></tr>
      ${topU.map(i => `<tr data-item="${i.sku}">${nameCell(i)}<td class="r">${i.sold}</td><td class="r">${dec(i.velocity)}</td><td class="r">${pct(i.st)}</td></tr>`).join("")}</table></div>
    <h2>Top 10 · actual sales</h2>
    <div class="card scroll-x"><table class="simple"><tr><th>Item</th><th class="r">Units</th><th class="r">Actual</th><th class="r">Realised</th></tr>
      ${topA.map(i => `<tr data-item="${i.sku}">${nameCell(i)}<td class="r">${i.sold}</td><td class="r">${RM(i.actual)}</td><td class="r">${pct(i.realisation)}</td></tr>`).join("")}
      <tr><td class="muted">Top 5 share of sales</td><td></td><td></td><td class="r"><strong>${pct(top5)}</strong></td></tr></table></div>
    <h2>Category performance</h2>
    <div class="card scroll-x"><table class="simple"><tr><th>Category</th><th class="r">Units</th><th class="r">Actual</th><th class="r">Net</th><th class="r">Stock</th><th class="r">Sell-through</th></tr>
      ${Object.entries(cats).sort((a, b) => b[1].a - a[1].a).map(([k, c]) => `<tr><td>${esc(k)}</td><td class="r">${c.u}</td><td class="r">${RM(c.a)}</td><td class="r">${RM(c.a * (1 - rate))}</td><td class="r">${c.s}</td><td class="r">${pct(c.u + c.s ? c.u / (c.u + c.s) : null)}</td></tr>`).join("")}</table></div>`;
}

/* ---------- store list: the must-have pieces for each retailer ---------- */
const mustHave = (locId, it) => (it.shared ? it.shared.skus : [it.sku]).some(sku => !!codeRow(locId, sku)?.must_have);
async function setMustHave(r, skus, on) {
  await q(sb.from("retailer_codes").upsert(skus.map(sku => ({ location_id: r.id, sku, must_have: on })), { onConflict: "location_id,sku" }));
  skus.forEach(sku => { const c = codeRow(r.id, sku); if (c) c.must_have = on; else state.codes.push({ location_id: r.id, sku, code: null, price: null, must_have: on }); });
  localSet("codes", state.codes);
}
function storeListSheet(r) {
  const items = state.products.filter(p => p.status === "Active" || codeRow(r.id, p.sku)?.must_have).sort((a, b) => a.name.localeCompare(b.name));
  const picked = new Set(items.filter(p => codeRow(r.id, p.sku)?.must_have).map(p => p.sku)), start = new Set(picked);
  openSheet(`
    <h2>${esc(r.name)} store list</h2>
    <p class="small muted" style="margin:-4px 2px 12px">Tick the pieces ${esc(r.name)} should always have. Only these show under <b>Sold out</b> when they run out there. Unticking keeps all history.</p>
    <input class="search" id="slQ" type="search" placeholder="Search items">
    <div id="slList" style="margin-top:10px"></div>
    <div class="xt-bar"><span id="slN" class="small muted"></span><button type="button" class="btn primary" id="slSave">Save store list</button></div>`, root => {
    const draw = () => {
      const s = root.querySelector("#slQ").value.trim().toLowerCase();
      const list = items.filter(p => !s || p.name.toLowerCase().includes(s) || (p.family || "").toLowerCase().includes(s));
      root.querySelector("#slList").innerHTML = groupByCategory(list).map(([cat, ps]) => `<h3 style="margin:16px 2px 6px">${esc(CAT_PLURAL[cat] || cat)}</h3>
        <div class="list tight card" style="padding:0 14px">${ps.map(p => `<label class="row" style="cursor:pointer"><div class="grow"><div class="title">${esc(p.name)}</div>
          <div class="small muted">${esc(itemSub(p))}${p.status !== "Active" ? " · " + esc(p.status) : ""} · on shelf ${stockAt(r.id, p.sku)}</div></div>
          <input type="checkbox" data-sl="${esc(p.sku)}" ${picked.has(p.sku) ? "checked" : ""} style="width:22px;height:22px;min-height:0;flex:none;padding:0;box-shadow:none;accent-color:var(--accent)"></label>`).join("")}</div>`).join("") || `<div class="small muted">No items.</div>`;
      root.querySelectorAll("[data-sl]").forEach(c => c.onchange = () => { c.checked ? picked.add(c.dataset.sl) : picked.delete(c.dataset.sl); count(); });
    };
    const count = () => {
      const ch = [...items].filter(p => picked.has(p.sku) !== start.has(p.sku)).length;
      root.querySelector("#slN").textContent = `${picked.size} on the list${ch ? ` · ${ch} change${ch > 1 ? "s" : ""}` : ""}`;
      root.querySelector("#slSave").disabled = !ch;
    };
    root.querySelector("#slQ").oninput = draw;
    root.querySelector("#slSave").onclick = async () => {
      const on = items.filter(p => picked.has(p.sku) && !start.has(p.sku)).map(p => p.sku), off = items.filter(p => !picked.has(p.sku) && start.has(p.sku)).map(p => p.sku);
      try { if (on.length) await setMustHave(r, on, true); if (off.length) await setMustHave(r, off, false); toast("Store list saved"); closeSheet(); render(); } catch (e) { fail(e); }
    };
    draw(); count();
  });
}

function rStock(r, d, items) {
  items = collapseShared(items);
  const f = state.rFilter || "in";
  const isDisc = i => ["Discontinued", "Replaced"].includes(i.p.status) && i.current > 0;
  const isOut = i => i.current <= 0 && mustHave(r.id, i);
  const list = items.filter(i => f === "all" ? true : f === "in" ? i.current > 0 : f === "nocode" ? !i.code : f === "disc" ? isDisc(i) : isOut(i));
  const nList = state.codes.filter(c => c.location_id === r.id && c.must_have).length;
  const total = items.reduce((t, i) => t + Math.max(0, i.current), 0), value = items.reduce((t, i) => t + Math.max(0, i.value), 0);
  const noCode = usesCodes(r) ? items.filter(i => !i.code && i.current > 0).length : 0;
  return `
    <div class="figures"><div class="figure"><div class="label">Pieces on shelf</div><div class="value">${total}</div></div><div class="figure"><div class="label">Stock value</div><div class="value">${RM(value)}</div></div></div>
    ${!usesCodes(r) ? `<p class="small muted" style="margin:0 2px 10px">${esc(r.name)} doesn't use item codes. <button type="button" class="link" data-a="codes">Turn codes on</button></p>` : ""}
    ${noCode ? `<div class="warn-banner">${noCode} item${noCode > 1 ? "s" : ""} on the shelf still need${noCode > 1 ? "" : "s"} a ${esc(r.name)} code (<button type="button" class="link" data-a="codes">shop doesn't use codes?</button>). Tap to add it.</div>` : ""}
    <button type="button" class="btn block" data-a="store" style="margin:0 0 12px">Edit store list · ${nList} must-have piece${nList === 1 ? "" : "s"}</button>
    <div class="chips" style="margin-top:0">${[["in", "In stock", items.filter(i => i.current > 0).length], ["out", "Sold out", items.filter(isOut).length], ["disc", "Discontinued", items.filter(isDisc).length], ...(usesCodes(r) ? [["nocode", "No code", null]] : []), ["all", "All", null]].map(([k, l, n]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${l}${n != null ? ` · ${n}` : ""}</button>`).join("")}</div>
    ${f === "out" ? `<p class="small muted" style="margin:-4px 2px 10px">Store-list pieces with none left at ${esc(r.name)}.</p>` : f === "disc" ? `<p class="small muted" style="margin:-4px 2px 10px">Discontinued or replaced pieces still on ${esc(r.name)}'s shelf: collect or sell off.</p>` : ""}
    ${groupByCategory(list.map(i => i.p)).map(([cat, ps]) => { const its = ps.map(p => list.find(i => i.sku === p.sku)); const n = its.reduce((t, i) => t + Math.max(0, i.current), 0);
      return `<details class="group" data-key="rs:${esc(cat)}"><summary>${catIco(cat)}<span class="grow">${esc(cat)}<span class="small muted" style="display:block;font-weight:500">${its.length} item${its.length > 1 ? "s" : ""} · ${RM(its.reduce((t, i) => t + Math.max(0, i.value), 0))}</span></span><span class="count">${n}</span>${CHEV}</summary>
      <div class="inner">${its.map(i => `<div class="row" data-item="${i.sku}"><div class="grow"><div class="title" style="white-space:normal">${esc(i.p.name)}</div>
      <div class="small muted">${codeChip(i)} In ${i.stockIn} · Sold ${i.sold} · ${RM(i.price)}${i.current > 0 ? ` · Value ${RM(i.value)}` : ""}${i.sharedRow ? ` · ${i.shared.code ? "one shop code for" : "sizes together:"} ${esc(i.shared.sizes.join(", "))}` : ""}</div>
      <div style="margin-top:5px">${tag(i.action, ACTION_TONE[i.action])}${mustHave(r.id, i) ? " " + tag("Store list", "") : ""}</div></div>
      <span class="num" style="font-size:20px;font-weight:700;${i.current <= 0 ? "color:var(--rust)" : ""}">${i.current}</span></div>`).join("")}</div></details>`; }).join("") || `<div class="empty">Nothing here.</div>`}`;
}

function rStockIn(r, d) {
  const groups = {};
  d.moves.filter(m => m.to_location === r.id || m.from_location === r.id).forEach(m => {
    const k = m.moved_on + "|" + (m.ref || "") + "|" + m.reason + "|" + (m.to_location === r.id ? "in" : "out");
    (groups[k] = groups[k] || { date: m.moved_on, ref: m.ref, reason: m.reason, dir: m.to_location === r.id ? "in" : "out", rows: [] }).rows.push(m);
  });
  const label = g => g.dir === "in" ? (g.reason === "correction" ? "Count fixed (+)" : "Stock in") : g.reason === "return" ? "Returned to workshop" : g.reason === "loss" ? "Lost / damaged" : "Count fixed (−)";
  const list = Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  const totalIn = d.moves.filter(m => m.to_location === r.id && (m.reason === "restock" || m.reason === "transfer")).reduce((t, m) => t + m.qty, 0);
  return `
    <div class="figures"><div class="figure"><div class="label">Total stock in</div><div class="value">${totalIn}</div></div><div class="figure"><div class="label">Deliveries</div><div class="value">${list.filter(g => g.dir === "in" && g.reason !== "correction").length}</div></div></div>
    <button class="btn primary block" data-a="send" style="margin-bottom:12px">+ Record a delivery</button>
    <div class="tl">${list.map(g => `<div class="tl-item"><span class="tl-dot" style="${g.dir === "out" ? "background:var(--coral)" : ""}"></span><div class="tl-card">
      <div class="tl-meta"><span class="tl-chip">${esc(g.ref || label(g))}</span><span>${shortDate(g.date)} ${new Date(g.date).getFullYear() !== new Date().getFullYear() ? new Date(g.date).getFullYear() : ""}</span></div>
      <div class="small muted" style="margin-bottom:6px">${label(g)} · ${g.rows.reduce((t, m) => t + m.qty, 0)} pieces</div>
      <table class="simple">${g.rows.map(m => `<tr data-item="${m.sku}"><td>${codeChip({ code: codeAt(r.id, m.sku) })} ${esc(prod(m.sku)?.name || m.sku)}</td><td class="r"><strong>${g.dir === "in" ? "" : "−"}${m.qty}</strong></td></tr>`).join("")}</table>
    </div></div>`).join("") || `<div class="empty">No deliveries yet.</div>`}</div>`;
}

function rSales(r, d) {
  const rate = Number(r.commission_rate) || 0;
  const months = [...new Set(d.sales.map(s => (s.sale_month || s.sold_at).slice(0, 7)))].sort().reverse();
  const mon = months.includes(state.rMonth) ? state.rMonth : months[0];
  if (!mon) return `<div class="empty">No sales reports yet. Use “Paste sales” above.</div>`;
  const lines = d.sales.filter(s => (s.sale_month || s.sold_at).slice(0, 7) === mon);
  const agg = {}; lines.forEach(s => { const o = agg[s.sku] = agg[s.sku] || { sku: s.sku, qty: 0, amt: 0, notes: [] }; o.qty += s.qty || 0; o.amt += Number(s.amount); if (s.notes) o.notes.push(s.notes); });
  const rows = Object.values(agg).map(o => { const p = prod(o.sku), price = shopPrice(r.id, o.sku); const gross = o.qty * price; return { ...o, p, price, gross, comm: o.amt * rate, net: o.amt * (1 - rate), asp: o.qty ? o.amt / o.qty : 0, disc: gross ? 1 - o.amt / gross : 0 }; })
    .sort((a, b) => b.amt - a.amt);
  const T = k => rows.reduce((t, x) => t + x[k], 0);
  return `
    <div class="chips" style="margin-top:0">${months.map(m => `<button class="chip" data-mon="${m}" aria-pressed="${m === mon}">${fmtMonth(m)}</button>`).join("")}</div>
    <div class="figures">
      <div class="figure lead"><div class="label">${fmtMonth(mon)} · ${T("qty")} pieces · ${lines.some(x => x.notes === "Mid-month report") ? "mid-month report (not final yet)" : "final report"}</div><div class="value">${RM(T("amt"))}</div></div>
      ${(() => { const p = (d.pays || []).find(x => x.period_month.slice(0, 7) === mon); return p ? `<div class="figure" style="grid-column:1/-1"><div class="label">Payment for ${fmtMonth(mon)}</div><div class="value" style="font-size:16px">${p.paid ? `Paid ${RM(p.paid_amount ?? p.net_amount)} on ${shortDate(p.paid_on)}` : `${RM(p.net_amount)} due ${shortDate(p.due_on || dueDate(mon))}${(p.due_on || dueDate(mon)) < ymd(new Date()) ? " · overdue" : ""}`}</div></div>` : ""; })()}
      <div class="figure"><div class="label">Gross (retail price)</div><div class="value">${RM(T("gross"))}</div></div>
      <div class="figure"><div class="label">Commission ${Math.round(rate * 100)}%</div><div class="value">−${RM(T("comm"))}</div></div>
      <div class="figure"><div class="label">Net proceeds</div><div class="value">${RM(T("net"))}</div></div>
      <div class="figure"><div class="label">Avg selling price</div><div class="value">${T("qty") ? RM(T("amt") / T("qty")) : "—"}</div></div>
    </div>
    <div class="list tight">${rows.map(x => `<div class="row" data-item="${x.sku}"><div class="grow"><div class="title">${esc(x.p?.name || x.sku)}</div>
      <div class="small muted">${codeChip({ code: codeAt(r.id, x.sku) })} ${x.qty} × ${RM(x.price)}${x.disc > 0.005 ? ` · <span style="color:var(--rust)">${pct(x.disc)} off</span>` : ""} · net ${RM(x.net)}</div></div>
      <span class="value">${RM(x.amt)}</span></div>`).join("")}</div>`;
}

function rAnalysis(r, d, items) {
  const f = state.rFilter === "all" ? null : state.rFilter;   /* "All" = no filter */
  /* one entry per design; sizes are listed inside it */
  const designs = [];
  for (const i of items) {
    let g = designs.find(x => x.key === i.group.key);
    if (!g) designs.push(g = { key: i.group.key, name: i.group.name, cls: i.group.cls || i.cls, items: [] });
    g.items.push(i);
  }
  designs.forEach(g => { g.items.sort((a, b) => SIZE_ORDER.indexOf(a.group.size) - SIZE_ORDER.indexOf(b.group.size)); g.sold = g.items.reduce((t, i) => t + i.sold, 0); g.current = g.items.reduce((t, i) => t + i.current, 0);
    g.lastSale = g.items.map(i => i.lastSale).filter(Boolean).sort().pop() || null; g.first = g.items.map(i => i.first).filter(Boolean).sort()[0] || null; });
  const labels = [...CLASS_ORDER.filter(k => k !== "status").flatMap(k => [CLASS_INFO[k].label, "Likely " + CLASS_INFO[k].label]), "Paused", "Replaced", "Discontinued"];
  const known = [...new Set([...labels, ...designs.map(g => g.cls.label)])];
  const list = designs.filter(g => !f || g.cls.label === f).sort((a, b) => known.indexOf(a.cls.label) - known.indexOf(b.cls.label) || (b.cls.pace ?? -1) - (a.cls.pace ?? -1) || b.sold - a.sold);
  const months = designs[0]?.cls.months || [];
  const paceTxt = c => c.pace == null ? "—" : c.paceHi != null && Math.abs(c.paceHi - c.pace) >= 0.01 ? `${n1(c.pace)}–${n1(c.paceHi)}` : n1(c.pace);
  return `
    <p class="small muted" style="margin:0 2px 10px">How each design is selling at ${esc(r.name)} from ${months.length ? `${monName(months[0])} to ${monName(months[3], true)}` : "the last 4 full months"} (this month isn't finished, so it's left out). Sizes of one design count together.
      Speed = pieces sold for every 30 days on the shelf. <b>Core</b>: 2+ a month and sells most months. <b>Promising</b>: 1+ a month. <b>Slow-moving</b>: under 1 a month. <b>Dormant</b>: nothing sold for 3 months while on the shelf.
      <b>Likely…</b> means it ran out and the report doesn't say which day, so it may be doing even better. Each item has a <b>Next</b> step.</p>
    <div class="chips" style="margin-top:0"><button class="chip" data-f="all" aria-pressed="${!f}">All · ${designs.length}</button>${known.map(k => { const n = designs.filter(g => g.cls.label === k).length; return n ? `<button class="chip" data-f="${esc(k)}" aria-pressed="${f === k}">${esc(k)} · ${n}</button>` : ""; }).join("")}</div>
    <div class="list">${list.map(g => { const one = g.items.length === 1 ? g.items[0] : null; return `<div class="row" ${one ? `data-item="${one.sku}"` : ""} style="display:block">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div class="title" style="white-space:normal">${esc(one ? one.p.name : g.name)}</div>${tag(g.cls.label, g.cls.tone)}</div>
      <div class="small muted" style="margin:3px 0 4px">${one ? `${codeChip(one)} ${esc(one.p.family || "")}` : `${g.items.length} sizes`}${g.first ? ` · first delivered ${shortDate(g.first)} ${g.first.slice(0, 4)}` : ""}</div>
      <div class="small" style="margin:0 0 4px;line-height:1.45">${esc(g.cls.why)}</div>
      ${g.cls.next ? `<div class="small" style="margin:0 0 8px;line-height:1.45"><b>Next:</b> ${esc(g.cls.next)}</div>` : ""}
      <div class="mini-grid">
        <div><span>Pace/mo</span><b>${paceTxt(g.cls)}</b></div><div><span>Sold (4 mo)</span><b>${g.cls.units ?? "—"}</b></div><div><span>Days in stock</span><b>${g.cls.daysSure == null ? "—" : g.cls.daysSure === g.cls.daysMaybe ? g.cls.daysSure : `${g.cls.daysSure}–${g.cls.daysMaybe}`}</b></div>
        <div><span>Stock now</span><b>${g.current}</b></div><div><span>Sold (all)</span><b>${g.sold}</b></div><div><span>Last sale</span><b>${g.lastSale ? monthStart(g.lastSale).toLocaleDateString("en-MY", { month: "short", year: "2-digit" }) : "—"}</b></div>
      </div>
      <div class="small muted" style="margin-top:8px">Stock &amp; restock${one ? "" : " by size"} (separate)</div>
      ${g.items[0].shared ? `<div class="small muted" style="margin-top:4px">${g.items[0].shared.code ? `${esc(r.name)} uses one code (${esc(g.items[0].shared.code)}) for ${esc(g.items[0].shared.sizes.join(", "))}` : `${esc(r.name)} doesn't separate ${esc(g.items[0].shared.sizes.join(", "))}`}, so sizes aren't tracked there · stock ${g.items[0].shared.current}</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px" data-item="${g.items[0].sku}">${tag(g.items[0].shared.action, ACTION_TONE[g.items[0].shared.action])}${tag(g.items[0].shared.stockStatus)}</div>` :
      one ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">${tag(one.action, ACTION_TONE[one.action])}${tag(one.stockStatus)}</div>` :
        `<div class="list tight" style="margin-top:4px">${g.items.map(i => `<div class="row" data-item="${i.sku}"><div class="grow"><div class="title small">${esc(i.group.size || i.p.size || "")} ${codeChip(i)}</div>
          <div class="small muted">Stock ${i.current} · Sold ${i.sold}${i.p.status !== "Active" ? ` · ${esc(i.p.status)}` : ""}</div></div>
          <div style="display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end">${tag(i.action, ACTION_TONE[i.action])}${tag(i.stockStatus)}</div></div>`).join("")}</div>`}
    </div>`; }).join("")}</div>`;
}

/* tap an item on a retailer page: its numbers + set the shop's code */
function itemAtRetailerSheet(r, it) {
  if (!it) return;
  const p = it.p, sizes = designSkus(p.sku), sh = it.shared, coded = usesCodes(r);
  if (sh) it = { ...it, current: sh.current, sold: sh.sold, stockIn: sh.stockIn, actual: sh.actual, action: sh.action, stockStatus: sh.stockStatus };
  openSheet(`
    <h2>${esc(p.name)}</h2>
    <p class="small muted">${esc(itemSub(p))} · Original price ${RM(p.retail_price)} · ${esc(p.status)}</p>
    <form id="cf" style="margin-bottom:12px">
      <div class="two">${coded ? `<label class="field"><span>${esc(r.name)} code</span><input id="code" value="${esc(it.code || "")}" placeholder="e.g. APO091" autocapitalize="characters"></label>` : ""}
      <label class="field"><span>${esc(r.name)} price (RM)</span><input id="price" type="number" step="0.01" min="0" inputmode="decimal" value="${it.price}"></label></div>
      ${sizes.length > 1 ? `<label style="display:flex;gap:8px;align-items:flex-start;margin:0 2px 12px"><input type="checkbox" id="allSizes" ${sh ? "checked" : ""} style="width:auto;min-height:0;margin-top:3px"><span class="small">${coded ? "Same code for all sizes" : "Sizes together"} (${esc(sizes.map(x => sizeShort(prod(x)?.size) || "").join(", "))}) — tick if ${esc(r.name)} doesn't separate sizes</span></label>` : ""}
      ${sh ? `<p class="small muted" style="margin:-4px 2px 12px">${esc(r.name)} doesn't separate sizes for this design, so figures below are for the whole design.</p>` : ""}
      <button class="btn block">Save ${coded ? "code & " : ""}price</button></form>
    <div class="figures">
      <div class="figure"><div class="label">On shelf</div><div class="value">${it.current}</div></div>
      <div class="figure"><div class="label">Sold</div><div class="value">${it.sold}</div></div>
      <div class="figure"><div class="label">Stock in</div><div class="value">${it.stockIn}</div></div>
      <div class="figure"><div class="label">Actual sales</div><div class="value">${RM(it.actual)}</div></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${clsTag(it)}${tag(it.action, ACTION_TONE[it.action])}${tag(it.stockStatus)}</div>
    <p class="small muted" style="margin:-6px 2px 6px">${esc(it.cls.why)}</p>
    ${it.cls.next ? `<p class="small" style="margin:0 2px 14px"><b>Next:</b> ${esc(it.cls.next)}</p>` : ""}
    <label class="row" style="margin:0 0 12px;cursor:pointer"><div class="grow"><div class="title">On the ${esc(r.name)} store list</div><div class="small muted">Must-have piece: shows under Sold out when it runs out here</div></div>
      <input type="checkbox" id="mh" ${mustHave(r.id, it) ? "checked" : ""} style="width:22px;height:22px;min-height:0;flex:none;padding:0;box-shadow:none;accent-color:var(--accent)"></label>
    <div class="btns"><button class="btn" id="adj">Fix count</button><button class="btn" id="edit">Edit item</button></div>`, root => {
    root.querySelector("#mh").onchange = async e => {
      try { await setMustHave(r, sh ? sh.skus : [p.sku], e.target.checked); toast(e.target.checked ? "Added to the store list" : "Taken off the store list"); render(); }
      catch (err) { e.target.checked = !e.target.checked; fail(err); }
    };
    root.querySelector("#cf").onsubmit = async e => {
      e.preventDefault();
      const code = coded ? root.querySelector("#code").value.trim().toUpperCase() || null : (it.code || null);
      const pv = root.querySelector("#price").value, price = pv === "" ? null : Number(pv);
      try {
        const all = !!root.querySelector("#allSizes")?.checked, targets = all ? sizes : [p.sku];
        /* a code can only be shared by sizes of the same design, and only when "same code for all sizes" is ticked */
        const users = code ? skusForCode(r.id, code).filter(o => !targets.includes(o)) : [];
        const leaving = !all && sh ? sh.skus : [];   /* unticking: the other sizes give the shared code up */
        const other = users.find(o => !leaving.includes(o));
        if (other) return toast(sizes.includes(other) ? `${code} is already used for ${prod(other)?.name}. Tick "Same code for all sizes" to share it.` : `${code} is already used for ${prod(other)?.name}`);
        await q(sb.from("retailer_codes").upsert(targets.map(sku => ({ location_id: r.id, sku, code: all && !code ? (codeRow(r.id, sku)?.code ?? null) : code, sizes_together: all,
          price: sku === p.sku ? price : (codeRow(r.id, sku)?.price ?? price) })), { onConflict: "location_id,sku" }));
        /* unticking: the other sizes are counted separately again (and stop sharing a code) */
        if (sh && !all) { const rest = sh.skus.filter(x => x !== p.sku); if (rest.length) await q(sb.from("retailer_codes").update({ sizes_together: false, ...(sh.code ? { code: null } : {}) }).eq("location_id", r.id).in("sku", rest)); }
        await loadAll(); closeSheet(); toast("Saved"); render();
      } catch (err) { fail(err); }
    };
    root.querySelector("#adj").onclick = () => adjustSheet(p, r.id);
    root.querySelector("#edit").onclick = () => productForm(p);
  });
}

/* reads lines like "APO055  2  154" or "APO055 TEXTURED EARRINGS 2 154.00" using this shop's codes */
function parseLines(text, wantAmount, r) {
  const out = {}, errors = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const tokens = line.split(/[\s,;]+/);
    let code = null, idx = -1;
    for (let i = 0; i < tokens.length; i++) if (skuForCode(r.id, tokens[i])) { code = tokens[i].toUpperCase(); idx = i; break; }
    if (!code) { const m = line.match(/\b([A-Z]{2,5}\d{2,4})\b/i); if (m) errors.push(`${m[1].toUpperCase()} isn't in the ${r.name} code list. Add the code on the item first.`); continue; }
    const sku = skuForCode(r.id, code);
    const rest = line.slice(line.toUpperCase().indexOf(code) + code.length);
    const nums = (rest.match(/-?\d[\d,]*(\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, "")));
    if (!nums.length) { errors.push(`${code}: no quantity found`); continue; }
    let qty, amount;
    if (wantAmount && nums.length >= 2) { qty = nums[nums.length - 2]; amount = nums[nums.length - 1]; }
    else { qty = nums[nums.length - 1]; amount = qty * shopPrice(r.id, sku); }
    const o = out[sku] || (out[sku] = { sku, code, qty: 0, amount: 0 });
    o.qty += qty; o.amount = round2(o.amount + amount);
  }
  return { lines: Object.values(out), errors };
}
const afterRetailerSave = () => { if (state.tab === "retailer") renderRetailer(); else render(); };

/* ---------- shop reports (PDF or pasted text) ---------- */
const dueDate = mon => { const d = monthStart(mon); return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 15)); };
let pdfLib;
async function pdfLines(file) {
  if (!pdfLib) {
    await new Promise((ok, bad) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load the PDF reader. Check your connection.")); document.head.append(s); });
    pdfLib = window.pdfjsLib; pdfLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }
  const doc = await pdfLib.getDocument({ data: await file.arrayBuffer() }).promise, out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const items = (await (await doc.getPage(n)).getTextContent()).items.filter(i => i.str.trim());
    const rows = [];
    for (const it of items) {          /* put words that sit on the same line back together */
      const y = it.transform[5], x = it.transform[4];
      let row = rows.find(r => Math.abs(r.y - y) < 3);
      if (!row) rows.push(row = { y, parts: [] });
      row.parts.push({ x, s: it.str.trim() });
    }
    rows.sort((a, b) => b.y - a.y).forEach(r => out.push(r.parts.sort((a, b) => a.x - b.x).map(p => p.s).join("  ")));
  }
  return out;
}
const numsIn = s => (s.replace(/RM/gi, " ").match(/-?\d[\d,]*(\.\d+)?/g) || []).map(v => Number(v.replace(/,/g, "")));
/* read Art Attic's report PDFs. Three layouts are known:
   "Yearly Sales Analysis" (code + name, then "Amt" and "Qty" lines), "Month End Stock Balance" (code … UNIT total-qty …),
   "Customer Price History" (one row per sale: date, doc no+code, name, qty UNIT RM price, sub-total). Anything else: code + numbers on one line. */
const MON3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function reportDate(s) {
  let m = String(s).match(/(\d{1,2})[-\s]([A-Za-z]{3})[a-z]*[-\s](\d{2,4})/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return ymd(new Date(y, MON3[m[2].toLowerCase()] - 1, +m[1])); }
  m = String(s).match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return ymd(new Date(y, +m[2] - 1, +m[1])); }
  return null;
}
function reportMeta(lines) {
  const all = lines.join("\n");
  const kind = /Yearly Sales Analysis/i.test(all) ? "sales" : /Month End Stock Balance/i.test(all) ? "stock" : /Customer Price History/i.test(all) ? "history" : null;
  const fr = all.match(/From\s+(\S+)\s+to\s+(\S+)/i), asat = all.match(/As At\s+(\S+)/i);
  const to = fr ? reportDate(fr[2]) : null, at = asat ? reportDate(asat[1]) : null;
  const end = to || at;
  /* month the report is about; a stock count taken on the 1st belongs to the month before */
  let mon = end ? end.slice(0, 7) : null;
  if (kind === "stock" && at && +at.slice(8, 10) === 1) { const d = new Date(at + "T00:00"); d.setDate(0); mon = ymd(d).slice(0, 7); }
  const lastDay = end ? new Date(+end.slice(0, 4), +end.slice(5, 7), 0).getDate() : 31;
  const stage = to ? (+to.slice(8, 10) >= lastDay - 2 ? "final" : "mid") : null;
  return { kind, mon, stage, date: at || to, to };
}
function readReport(lines, r, mode) {
  const meta = reportMeta(lines), out = [], seen = {};
  const put = (code, qty, amount) => {
    code = code.toUpperCase(); const sku = skuForCode(r.id, code), key = sku || code;
    if (seen[key]) { if (mode === "stock") seen[key].qty = qty; else { seen[key].qty += qty; seen[key].amount = round2((seen[key].amount || 0) + (amount || 0)); } return; }
    out.push(seen[key] = { code, sku, qty, amount: amount == null ? null : round2(amount) });
  };
  const CODE = /\b([A-Z]{2,5}\d{3})\b/i, GLUED = /([A-Z]{2,5}\d{3})\b/i;
  if (meta.kind === "sales") {
    let cur = null, amt = null;
    for (const raw of lines) {
      const t = raw.trim(), c = t.match(/^([A-Z]{2,5}\d{3})\b/i);
      if (c) { cur = c[1]; amt = null; continue; }
      if (/^Sub\s*Total/i.test(t)) { cur = null; continue; }   /* totals repeat the figures above */
      if (!cur) continue;
      if (/^Amt\b/i.test(t)) { const n = numsIn(t); amt = n[n.length - 1]; }
      else if (/^Qty\b/i.test(t)) { const n = numsIn(t); put(cur, Math.round(n[n.length - 1] || 0), amt || 0); cur = null; }
    }
  } else if (meta.kind === "stock") {
    for (const raw of lines) {
      const m = raw.match(/\b([A-Z]{2,5}\d{3})\b.*?\bUNIT\b\s+([\d,.]+)/i);
      if (m) { const q = Math.round(Number(m[2].replace(/,/g, ""))); if (q || mode === "stock") put(m[1], q, null); }
    }
    if (mode === "stock") for (let i = out.length - 1; i >= 0; i--) if (!out[i].qty && !out[i].sku) out.splice(i, 1);
  } else if (meta.kind === "history") {
    for (const raw of lines) {
      const m = raw.match(/\d{2}-\d{2}-\d{4}\s+\S*?([A-Z]{2,5}\d{3})\b.*?([\d.]+)\s*UNIT\s+RM\s*([\d,.]+)\s+([\d,.]+)\s*$/i);
      if (m) put(m[1], Math.round(Number(m[2])), Number(m[4].replace(/,/g, "")));
    }
  } else {
    for (const raw of lines) {
      const line = raw.trim(); if (!line) continue;
      const tokens = line.split(/[\s,;|]+/);
      let code = tokens.find(t => skuForCode(r.id, t));
      if (!code) { const m = line.match(CODE) || line.match(GLUED); if (!m) continue; code = m[1]; }
      const nums = numsIn(line.slice(line.toUpperCase().indexOf(code.toUpperCase()) + code.length));
      if (!nums.length) continue;
      if (mode === "stock") { put(code, [...nums].reverse().find(n => Number.isInteger(n) && n >= 0) ?? 0, null); continue; }
      let hit = null;
      for (let i = 0; i < nums.length && !hit; i++) for (let j = 0; j < nums.length && !hit; j++) for (let k = 0; k < nums.length && !hit; k++)
        if (i !== j && j !== k && i !== k && Number.isInteger(nums[i]) && nums[i] > 0 && nums[i] < 1000 && Math.abs(nums[i] * nums[j] - nums[k]) < 0.06 && nums[k] >= nums[j]) hit = [nums[i], nums[k]];
      if (hit) put(code, hit[0], hit[1]);
      else if (nums.length >= 2) put(code, nums.find(n => Number.isInteger(n) && n > 0 && n < 1000) ?? nums[0], nums[nums.length - 1]);
      else { const sku = skuForCode(r.id, code); put(code, nums[0], sku ? nums[0] * shopPrice(r.id, sku) : 0); }
    }
  }
  out.meta = meta;
  return out;
}
/* shared top part: choose a PDF or paste text */
const sourcePicker = () => `
  <div class="src-pick">
    <label class="btn primary">Upload PDF<input type="file" accept="application/pdf,.pdf" id="pdfIn" hidden></label>
    <button type="button" class="btn" id="tapToggle">Tap items</button>
  </div>
  <div id="tapBox" hidden></div>
  <div id="readStatus" class="small muted" style="margin:6px 2px"></div>`;
function bindSource(root, onLines) {
  root.querySelector("#pdfIn").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    root.querySelector("#readStatus").textContent = `Reading ${f.name}…`;
    try { onLines(await pdfLines(f), f.name); } catch (err) { root.querySelector("#readStatus").textContent = ""; fail(err); }
    e.target.value = "";
  };
}
/* tap items: picture tiles like the Sell tab, for a shop's sales or stock count. picked = { sku: qty } */
function tapPicker(root, r, picked, onChange, hint) {
  let openKey = null;
  const tapPic = p => { const img = photo(p); return img ? `<img src="${img}" alt="" loading="lazy">` : `<div class="ph ${catG(p.category)}"></div>`; };
  const stepper = (sku, n) => `<span class="stepper"><button type="button" data-tdec="${sku}" aria-label="One fewer">−</button><b>${n}</b><button type="button" data-tinc="${sku}" aria-label="One more">+</button></span>`;
  const redraw = () => {
    const box = root.querySelector("#tapBox"); if (box.hidden) return;
    const term = (box.querySelector("#tapFlt")?.value || "").toLowerCase();
    /* items this shop has or has a code for come first; sizes the shop doesn't separate act as one tile */
    const pool = state.products.filter(p => p.status === "Active" || stockAt(r.id, p.sku) > 0 || codeAt(r.id, p.sku));
    const groups = sizeGroups(pool.filter(p => !term || p.name.toLowerCase().includes(term) || (codeAt(r.id, p.sku) || "").toLowerCase().includes(term)), r.id)
      .sort((a, b) => (b.left > 0) - (a.left > 0) || !!codeAt(r.id, b.items[0].p.sku) - !!codeAt(r.id, a.items[0].p.sku) || a.name.localeCompare(b.name));
    const tile = g => {
      const lead = g.items[0].p, shared = sharedSkus(r.id, lead.sku).length > 1;
      const n = g.items.reduce((t, it) => t + (picked[it.p.sku] || 0), 0);
      if (g.items.length === 1 || shared) return `<div class="tile ${n ? "in-cart" : ""} ${g.left <= 0 ? "out" : ""}" data-tadd="${lead.sku}" role="button" tabindex="0">${tapPic(lead)}${n ? `<span class="count">${n}</span>` : ""}
        <div class="name">${esc(g.name)}</div><div class="meta">${RM(shopPrice(r.id, lead.sku))} · ${g.left} at shop${shared ? " · all sizes" : ""}</div>${n ? stepper(lead.sku, n) : ""}</div>`;
      return `<div class="tile group-tile ${n || openKey === g.key ? "in-cart" : ""} ${g.left <= 0 ? "out" : ""}" data-tgroup="${esc(g.key)}" role="button" tabindex="0">${tapPic(lead)}${n ? `<span class="count">${n}</span>` : ""}
        <div class="name">${esc(g.name)}</div><div class="meta">${RM(shopPrice(r.id, lead.sku))} · ${g.left} at shop</div>
        <div class="size-chips">${g.items.map(it => `<span class="${it.left > 0 ? "" : "none"}">${esc(it.size)}</span>`).join("")}</div></div>
        ${openKey === g.key ? `<div class="sizes"><div class="sizes-head"><b>Choose size</b><button type="button" class="link" data-tclose="1">Done</button></div>
          ${g.items.map(it => `<div class="size-row"><span class="size-name">${esc(it.size)}</span><span class="size-meta">${RM(shopPrice(r.id, it.p.sku))} · ${it.left} at shop</span>${stepper(it.p.sku, picked[it.p.sku] || 0)}</div>`).join("")}</div>` : ""}`;
    };
    const pcs = Object.values(picked).reduce((t, n) => t + n, 0);
    box.querySelector("#tapGrid").innerHTML = groups.length ? `<div class="grid sm">${groups.map(tile).join("")}</div>` : `<div class="empty">No items match.</div>`;
    box.querySelector("#tapCount").textContent = hint(pcs);
    const bump = (sku, d) => { picked[sku] = Math.max(0, (picked[sku] || 0) + d); onChange(); redraw(); };
    box.querySelectorAll("[data-tadd]").forEach(t => t.onclick = e => { if (e.target.closest(".stepper")) return; bump(t.dataset.tadd, 1); });
    box.querySelectorAll("[data-tgroup]").forEach(t => t.onclick = () => { openKey = openKey === t.dataset.tgroup ? null : t.dataset.tgroup; redraw(); });
    box.querySelectorAll("[data-tinc]").forEach(b => b.onclick = e => { e.stopPropagation(); bump(b.dataset.tinc, 1); });
    box.querySelectorAll("[data-tdec]").forEach(b => b.onclick = e => { e.stopPropagation(); bump(b.dataset.tdec, -1); });
    const c = box.querySelector("[data-tclose]"); if (c) c.onclick = e => { e.stopPropagation(); openKey = null; redraw(); };
  };
  root.querySelector("#tapToggle").onclick = () => {
    const box = root.querySelector("#tapBox"); box.hidden = false; root.querySelector("#tapToggle").hidden = true;
    box.innerHTML = `<input class="search" id="tapFlt" type="search" placeholder="Search pieces${usesCodes(r) ? " or codes" : ""}"><div class="small muted" id="tapCount" style="margin:2px 2px 8px"></div><div id="tapGrid"></div>`;
    box.querySelector("#tapFlt").oninput = redraw; redraw();
  };
  return { redraw };
}
const itemSelect = (r, sel) => `<select data-fix>${'<option value="">Which item is this?</option>'}${activeProducts().concat(state.products.filter(p => p.status !== "Active")).map(p => `<option value="${p.sku}" ${sel === p.sku ? "selected" : ""}>${esc(nice(p.name))}</option>`).join("")}</select>`;

/* sales report: one per month. Mid-month is a first look; the end-of-month (whole month) report replaces it and is final */
function pasteSalesSheet(r) {
  const now = new Date(), def = now.getDate() <= 22 ? { mon: ym(now), stage: "mid" } : { mon: ym(now), stage: "final" };
  const lastMonth = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  if (now.getDate() <= 7) { def.mon = lastMonth; def.stage = "final"; }
  let lines = [], src = "";
  openSheet(`
    <h2>${esc(r.name)} sales report</h2>
    <label class="field"><span>Sales month</span><input id="mon" type="month" value="${def.mon}"></label>
    <div class="chips" id="stage"><button type="button" class="chip" data-stage="mid" aria-pressed="${def.stage === "mid"}">Mid-month report</button><button type="button" class="chip" data-stage="final" aria-pressed="${def.stage === "final"}">End of month (final)</button></div>
    <p class="small muted" style="margin:-4px 2px 12px">The end-of-month report covers the whole month, so it replaces the mid-month one.</p>
    ${sourcePicker()}
    <div id="out"></div>`, root => {
    let stage = def.stage, repTo = null;
    const picked = {};   /* tapped pieces: sku -> qty */
    root.querySelectorAll("[data-stage]").forEach(b => b.onclick = () => { stage = b.dataset.stage; root.querySelectorAll("[data-stage]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    const draw = async () => {
      const mon = root.querySelector("#mon").value, reportId = `${r.code}-SALES-${mon}`;
      let existing = [], pay = null;
      try { existing = await q(live("sales", "id,sku,qty").eq("report_id", reportId)); } catch {}
      try { [pay] = await q(sb.from("payouts").select("*").eq("location_id", r.id).eq("period_month", mon + "-01")); } catch {}
      const ok = lines.filter(l => l.sku), bad = lines.filter(l => !l.sku);
      const total = round2(ok.reduce((t, l) => t + Number(l.amount || 0), 0)), pcs = ok.reduce((t, l) => t + Number(l.qty || 0), 0);
      const comm = round2(total * Number(r.commission_rate));
      root.querySelector("#readStatus").textContent = lines.length ? `Read ${lines.length} item${lines.length > 1 ? "s" : ""} from ${src}. Check the numbers, then save.` : (src ? `No ${r.name} codes found in ${src}.` : "");
      root.querySelector("#out").innerHTML = !lines.length ? "" : `
        ${bad.length ? `<div class="warn-banner">${bad.length} code${bad.length > 1 ? "s" : ""} not in the ${esc(r.name)} list. Pick the item so it's counted, or leave it to skip.</div>` : ""}
        <div class="list tight">${lines.map((l, i) => `<div class="row edit-row" data-i="${i}"><div class="grow"><div class="title" style="white-space:normal">${l.sku ? (sharedSkus(r.id, l.sku).length > 1 ? `${esc(nice(baseName(prod(l.sku).name)))} (all sizes)` : esc(nice(prod(l.sku).name))) : itemSelect(r, null)}</div><div class="small muted">${[l.code ? esc(l.code) : "", l.sku ? `${RM(shopPrice(r.id, l.sku))} each` : "", l.sku && sharedSkus(r.id, l.sku).length > 1 ? "all sizes together" : ""].filter(Boolean).join(" · ")}</div></div>
          <input class="mini-num" data-k="qty" type="number" inputmode="numeric" value="${l.qty}" aria-label="Quantity"><input class="mini-num wide" data-k="amount" type="number" step="0.01" inputmode="decimal" value="${l.amount ?? ""}" aria-label="Amount"></div>`).join("")}</div>
        <div class="card" style="margin-top:12px"><table class="simple">
          <tr><td>${pcs} pieces sold</td><td class="r"><strong>${RM(total)}</strong></td></tr>
          <tr><td class="muted">Commission ${Math.round(Number(r.commission_rate) * 100)}%</td><td class="r muted">−${RM(comm)}</td></tr>
          <tr><td>You receive · due ${shortDate(dueDate(mon))}</td><td class="r"><strong>${RM(total - comm)}</strong></td></tr></table></div>
        ${existing.length ? `<div class="warn-banner">${monthLabel(mon)} already has a ${pay?.report_stage === "mid" ? "mid-month" : "saved"} report (${existing.length} lines${pay ? `, ${RM(pay.sales_amount)}` : ""}). Saving replaces it.${pay?.paid ? " That month is already marked paid; the paid amount stays as it is." : ""}</div>` : ""}
        <button class="btn primary block" id="save" style="margin-top:6px">Save ${stage === "mid" ? "mid-month" : "final"} report for ${monthLabel(mon)}</button>`;
      root.querySelectorAll(".edit-row").forEach(row => {
        const l = lines[Number(row.dataset.i)];
        row.querySelectorAll("[data-k]").forEach(inp => inp.onchange = () => { l[inp.dataset.k] = Number(inp.value) || 0; if (l.tapped && inp.dataset.k === "qty") { picked[l.sku] = l.qty; drawTap(); } if (inp.dataset.k === "amount") l.edited = true; draw(); });
        const fx = row.querySelector("[data-fix]"); if (fx) fx.onchange = () => { l.sku = fx.value || null; if (l.sku && l.amount == null) l.amount = l.qty * shopPrice(r.id, l.sku); draw(); };
      });
      const s = root.querySelector("#save"); if (s) s.onclick = async () => {
        if (!ok.length) return toast("Nothing to save yet");
        const ms = monthStart(mon), mid = repTo && repTo.slice(0, 7) === mon ? new Date(repTo + "T12:00") : new Date(ms.getFullYear(), ms.getMonth(), 15, 12);
        const last = stage === "mid" ? mid : new Date(ms.getFullYear(), ms.getMonth() + 1, 0, 12);
        try {
          if (existing.length) await q(sb.from("sales").update({ deleted_at: new Date().toISOString() }).eq("report_id", reportId).is("deleted_at", null));
          const row = (sku, qty, amount, extra) => ({ sold_at: last.toISOString(), sale_month: mon + "-01", channel: "retailer", location_id: r.id, report_id: reportId, sku, qty, unit_price: shopPrice(r.id, sku), amount: round2(amount), notes: stage === "mid" ? "Mid-month report" : null, ...extra });
          const rows = [];
          for (const l of ok) {
            const grp = sharedSkus(r.id, l.sku);
            if (grp.length < 2 || !(l.qty > 0)) { rows.push(row(l.sku, l.qty, l.amount || 0)); continue; }
            /* one code for all sizes: stock before this report = now + what the replaced report had taken off */
            const have = {}; grp.forEach(x => have[x] = stockAt(r.id, x) + existing.filter(e => e.sku === x).reduce((t, e) => t + (e.qty || 0), 0));
            const split = Object.entries(splitShared(grp, l.qty, have)); let left = round2(l.amount || 0);
            split.forEach(([sku, n], k) => { const a = k === split.length - 1 ? left : round2((l.amount || 0) * n / l.qty); left = round2(left - a); rows.push(row(sku, n, a, { description: "Size not given by shop" })); });
          }
          await q(sb.from("sales").insert(rows));
          await q(sb.from("payouts").upsert({ location_id: r.id, period_month: mon + "-01", sales_amount: total, commission: comm, net_amount: round2(total - comm), report_stage: stage, report_date: repTo && repTo.slice(0, 7) === mon ? repTo : ymd(new Date()), due_on: dueDate(mon) }, { onConflict: "location_id,period_month" }));
          await loadStock(); closeSheet(); toast(`${monthLabel(mon)} ${stage === "mid" ? "mid-month" : "final"} report saved · ${pcs} pieces`);
          state.rTab = "sales"; state.rMonth = mon; afterRetailerSave();
        } catch (e) { fail(e); }
      };
    };
    /* ---- tap items ---- */
    const syncLines = () => {
      for (const [sku, n] of Object.entries(picked)) {
        let l = lines.find(x => x.tapped && x.sku === sku);
        if (!n) { if (l) lines.splice(lines.indexOf(l), 1); delete picked[sku]; continue; }
        if (!l) lines.push(l = { code: codeAt(r.id, sku) || "", sku, qty: 0, amount: 0, tapped: true });
        if (!l.edited || l.qty !== n) { l.amount = round2(n * shopPrice(r.id, sku)); l.edited = false; }
        l.qty = n;
      }
      if (!src) src = "tapped items";
    };
    const tap = tapPicker(root, r, picked, () => { syncLines(); draw(); },
      pcs => pcs ? `${pcs} piece${pcs > 1 ? "s" : ""} tapped — check the list below, change an amount for discounts, then save.` : "Tap a piece to add one sold. Tap again for more.");
    const drawTap = tap.redraw;
    root.querySelector("#mon").onchange = () => lines.length && draw();
    bindSource(root, (ls, name) => {
      const got = readReport(ls, r, "sales"), m = got.meta;
      if (m.kind === "stock") { root.querySelector("#readStatus").textContent = ""; return toast("That's a stock report. Use Stock report on the shop page."); }
      src = name; lines = got.concat(lines.filter(l => l.tapped)); repTo = m.to || null;
      if (m.mon) root.querySelector("#mon").value = m.mon;
      const st = m.kind === "history" ? "mid" : m.stage;
      if (st) { stage = st; root.querySelectorAll("[data-stage]").forEach(x => x.setAttribute("aria-pressed", x.dataset.stage === st)); }
      draw();
    });
  });
}

/* stock report: the shop's count. Differences are shown to check; nothing changes until you choose */
function tallySheet(r) {
  let lines = [], src = "";
  openSheet(`
    <h2>${esc(r.name)} stock report</h2>
    <label class="field"><span>Date of the shop's count</span><input id="d" type="date" value="${ymd(new Date())}"></label>
    ${sourcePicker()}
    <div id="out"></div>`, root => {
    const picked = {};   /* tapped count: sku -> qty */
    const draw = () => {
      /* sizes sharing one shop code are counted together */
      const keyOf = sku => sharedKey(r.id, sku);
      const members = k => k.startsWith("g:") ? sharedSkus(r.id, k.slice(2)) : [k];
      const counted = {}; lines.filter(l => l.sku).forEach(l => { const k = keyOf(l.sku); counted[k] = (counted[k] || 0) + Number(l.qty || 0); });
      const skus = new Set([...Object.keys(counted), ...state.products.filter(p => stockAt(r.id, p.sku) !== 0).map(p => keyOf(p.sku))]);
      const rows = [...skus].map(sku => ({ sku, app: members(sku).reduce((t, x) => t + stockAt(r.id, x), 0), shop: counted[sku] || 0 }));
      const diffs = rows.filter(d => d.app !== d.shop), bad = lines.filter(l => !l.sku);
      root.querySelector("#readStatus").textContent = lines.length ? `Read ${lines.length} item${lines.length > 1 ? "s" : ""} from ${src}.` : (src ? `No ${r.name} codes found in ${src}.` : "");
      if (!lines.length) { root.querySelector("#out").innerHTML = ""; return; }
      root.querySelector("#out").innerHTML = `
        ${bad.length ? `<div class="warn-banner">${bad.map(b => esc(b.code)).join(", ")} ${bad.length > 1 ? "aren't" : "isn't"} in the ${esc(r.name)} list. Pick the item below.</div>
          <div class="list tight" style="margin-bottom:12px">${bad.map(b => `<div class="row" data-bad="${lines.indexOf(b)}"><div class="grow">${itemSelect(r, null)}<div class="small muted">${esc(b.code)} · shop count ${b.qty}</div></div></div>`).join("")}</div>` : ""}
        <div class="figures"><div class="figure"><div class="label">Shop counted</div><div class="value">${Object.values(counted).reduce((a, b) => a + b, 0)}</div></div><div class="figure"><div class="label">App says</div><div class="value">${stockTotalAt(r.id)}</div></div></div>
        ${diffs.length ? `<p class="small muted" style="margin:0 2px 10px">${diffs.length} item${diffs.length > 1 ? "s" : ""} to check. A difference can just be sales made after the sales report, so it's best to accept counts with the final end-of-month report.</p>
          <div class="list tight">${diffs.map(d => `<label class="row diff-row"><input type="checkbox" data-acc="${d.sku}" style="width:auto;min-height:0;box-shadow:none"><div class="grow"><div class="title" style="white-space:normal">${d.sku.startsWith("g:") ? `${esc(nice(baseName(prod(members(d.sku)[0])?.name || "")))} (all sizes)` : esc(nice(prod(d.sku)?.name || d.sku))}</div><div class="small muted">${[esc(codeAt(r.id, d.sku.startsWith("g:") ? d.sku.slice(2) : d.sku) || (usesCodes(r) ? "No code" : "")), `app ${d.app}`, `shop ${d.shop}`].filter(Boolean).join(" · ")}</div></div><span class="tag ${d.shop < d.app ? "brass" : "green"}">${d.shop > d.app ? "+" : ""}${d.shop - d.app}</span></label>`).join("")}</div>
          <button type="button" class="link" id="all" style="margin:10px 2px">Select all</button>`
        : `<div class="card"><h3>Everything matches</h3><p class="muted">${lines.length} items.</p></div>`}
        <button class="btn primary block" id="save" style="margin-top:8px">Save stock report${diffs.length ? " (use shop's count for ticked items)" : ""}</button>`;
      root.querySelectorAll("[data-bad]").forEach(row => row.querySelector("[data-fix]").onchange = e => { lines[Number(row.dataset.bad)].sku = e.target.value || null; draw(); });
      const all = root.querySelector("#all"); if (all) all.onclick = () => root.querySelectorAll("[data-acc]").forEach(c => c.checked = true);
      root.querySelector("#save").onclick = async () => {
        const acc = [...root.querySelectorAll("[data-acc]:checked")].map(c => diffs.find(d => d.sku === c.dataset.acc));
        const date = root.querySelector("#d").value;
        try {
          await q(sb.from("shop_stock_reports").insert({ location_id: r.id, report_date: date, lines: lines.map(l => ({ code: l.code, sku: l.sku, qty: l.qty })), notes: src }));
          const fix = [];
          for (const d of acc) {
            const ms = members(d.sku), note = ms.length > 1 ? "Shop stock report (all sizes, one code)" : "Shop stock report";
            if (d.shop > d.app) { fix.push({ moved_on: date, sku: ms[0], qty: d.shop - d.app, to_location: r.id, reason: "correction", notes: note }); continue; }
            const have = {}; ms.forEach(x => have[x] = stockAt(r.id, x));
            Object.entries(splitShared(ms, d.app - d.shop, have)).forEach(([sku, n]) => fix.push({ moved_on: date, sku, qty: n, from_location: r.id, reason: "correction", notes: note }));
          }
          if (fix.length) await q(sb.from("stock_movements").insert(fix));
          await loadStock(); closeSheet(); toast(acc.length ? `Stock report saved · ${acc.length} count${acc.length > 1 ? "s" : ""} updated` : "Stock report saved"); afterRetailerSave();
        } catch (e) { fail(e); }
      };
    };
    bindSource(root, (ls, name) => {
      const got = readReport(ls, r, "stock"), m = got.meta;
      if (m.kind === "sales" || m.kind === "history") { root.querySelector("#readStatus").textContent = ""; return toast("That's a sales report. Use Sales report on the shop page."); }
      src = name; lines = got; if (m.date) root.querySelector("#d").value = m.date; Object.keys(picked).forEach(k => delete picked[k]); draw();
    });
    /* tap what's on the shop's shelf; anything not tapped counts as none there */
    tapPicker(root, r, picked, () => {
      lines = Object.entries(picked).filter(([, n]) => n > 0).map(([sku, n]) => ({ code: codeAt(r.id, sku) || "", sku, qty: n, tapped: true }));
      src = "tapped count"; draw();
    }, pcs => pcs ? `${pcs} piece${pcs > 1 ? "s" : ""} counted. Anything you don't tap counts as none at the shop.` : "Tap each piece the shop has on its shelf (tap again for more).");
  });
}

/* delivery to a shop: pick items by name, type quantities; the shop code can be added now or later */
function sendStockSheet(r) {
  const list = activeProducts().slice().sort((a, b) => a.name.localeCompare(b.name));
  const mon = new Date().toLocaleDateString("en-MY", { month: "short" }).toUpperCase();
  const wsHas = stockTotalAt(workshop().id) > 0;
  openSheet(`
    <h2>Send stock to ${esc(r.name)}</h2>
    <div class="chips"><button class="chip" data-src="ws" aria-pressed="${wsHas}">From workshop stock</button><button class="chip" data-src="new" aria-pressed="${!wsHas}">Newly made pieces</button></div>
    <div class="two"><label class="field"><span>Date</span><input id="d" type="date" value="${ymd(new Date())}"></label>
    <label class="field"><span>Restock ID</span><input id="ref" value="${mon}-01"></label></div>
    <input class="search" id="flt" type="search" placeholder="Search items">
    <div class="list tight" id="pick">${list.map(p => { const c = codeAt(r.id, p.sku); return `<div class="row" data-name="${esc(p.name.toLowerCase())}"><div class="grow"><div class="title small" style="white-space:normal">${esc(p.name)}</div>
      <div class="small muted">${c || (!usesCodes(r) && codeRow(r.id, p.sku)) ? `${c ? `<span class="code">${esc(c)}</span> ` : ""}${RM(shopPrice(r.id, p.sku))}` : `<span style="display:flex;gap:6px;margin-top:4px">${usesCodes(r) ? `<input data-code="${p.sku}" placeholder="Code (optional)" class="mini-in">` : `<input data-code="${p.sku}" type="hidden">`}<input data-price="${p.sku}" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Price ${Number(p.retail_price)}" class="mini-in" style="width:96px"></span>`} <span data-have="${p.sku}"></span></div></div>
      <input type="number" inputmode="numeric" min="0" step="1" data-sku="${p.sku}" style="width:72px" placeholder="0"></div>`; }).join("")}</div>
    <button class="btn primary block" id="go" style="margin-top:12px">Save delivery</button>`, root => {
    let src = wsHas ? "ws" : "new";
    const showHave = () => root.querySelectorAll("[data-have]").forEach(e => e.textContent = src === "ws" ? `· ${stockAt(workshop().id, e.dataset.have)} in workshop` : "");
    showHave();
    root.querySelectorAll("[data-src]").forEach(b => b.onclick = () => { src = b.dataset.src; root.querySelectorAll("[data-src]").forEach(x => x.setAttribute("aria-pressed", x === b)); showHave(); });
    root.querySelector("#flt").oninput = e => { const s = e.target.value.toLowerCase(); root.querySelectorAll("#pick .row").forEach(row => row.hidden = s && !row.dataset.name.includes(s)); };
    root.querySelector("#go").onclick = async () => {
      const rows = [...root.querySelectorAll("input[data-sku]")].map(i => ({ sku: i.dataset.sku, qty: parseInt(i.value, 10) || 0 })).filter(x => x.qty > 0);
      if (!rows.length) return toast("Enter a quantity for at least one item");
      const sent = new Set(rows.map(x => x.sku));
      const codes = [...root.querySelectorAll("input[data-code]")].map(i => { const pv = root.querySelector(`input[data-price="${i.dataset.code}"]`).value; return { sku: i.dataset.code, code: i.value.trim().toUpperCase() || null, price: pv === "" ? null : Number(pv) }; })
        .filter(x => (x.code || x.price != null) && (sent.has(x.sku) || x.code));
      for (const c of codes.filter(c => c.code)) { const o = skusForCode(r.id, c.code).find(x => x !== c.sku && !designSkus(c.sku).includes(x)); if (o) return toast(`${c.code} is already ${prod(o)?.name}`); }
      const typed = codes.filter(c => c.code);
      for (const c of typed) { const o = typed.find(x => x !== c && x.code === c.code && !designSkus(c.sku).includes(x.sku)); if (o) return toast(`${c.code} is typed for two different items`); }
      const ws = workshop().id, date = root.querySelector("#d").value, ref = root.querySelector("#ref").value.trim() || null;
      try {
        if (codes.length) await q(sb.from("retailer_codes").upsert(codes.map(c => ({ location_id: r.id, ...c })), { onConflict: "location_id,sku" }));
        await q(sb.from("stock_movements").insert(rows.map(x => ({ moved_on: date, sku: x.sku, qty: x.qty, to_location: r.id, from_location: src === "ws" ? ws : null, reason: src === "ws" ? "transfer" : "restock", ref }))));
        await loadAll(); closeSheet();
        const missing = usesCodes(r) ? rows.filter(x => !codeAt(r.id, x.sku)).length : 0;
        toast(`${rows.reduce((t, x) => t + x.qty, 0)} pieces sent to ${r.name}${missing ? ` · ${missing} without a code yet` : ""}`);
        state.rTab = "in"; afterRetailerSave();
      } catch (e) { fail(e); }
    };
  });
}

/* switch item codes on or off for a shop (codes stay saved either way) */
async function toggleCodes(r) {
  const on = !usesCodes(r);
  if (!confirm(on ? `Use item codes for ${r.name} again?` : `${r.name} doesn't use item codes? The app stops asking for them. Saved codes are kept.`)) return;
  try { await q(sb.from("locations").update({ uses_codes: on }).eq("id", r.id)); r.uses_codes = on; localSet("locations", state.locations); toast(on ? "Item codes on" : "Item codes off for this shop"); render(); } catch (e) { fail(e); }
}
async function payoutsSheet(r) {
  let rows = [];
  try { rows = await q(sb.from("payouts").select("*").eq("location_id", r.id).order("period_month", { ascending: false })); } catch (e) { return fail(e); }
  openSheet(`
    <h2 style="margin-top:0">${esc(r.name)} payouts</h2>
    <div class="list tight">${rows.map(p => `<div class="row"><div class="grow"><div class="title">${monthLabel(p.period_month.slice(0, 7))} sales</div>
      <div class="small muted">${p.sales_amount ? `Sales ${RM(p.sales_amount)} · ` : ""}${p.report_stage === "mid" ? "mid-month figure · " : ""}${p.paid ? `Paid ${p.paid_on ? shortDate(p.paid_on) : ""}` : `Due ${shortDate(p.due_on || dueDate(p.period_month.slice(0, 7)))}${(p.due_on || dueDate(p.period_month.slice(0, 7))) < ymd(new Date()) ? " · overdue" : ""}`}</div></div>
      <span class="num">${RM(p.paid ? (p.paid_amount ?? p.net_amount) : p.net_amount)}</span>
      ${p.paid ? `<span class="tag">Paid</span>` : `<button class="btn" data-pay="${p.id}" style="min-height:36px">Mark paid</button>`}</div>`).join("") || `<div class="empty">No payouts yet.</div>`}</div>
    <button class="btn block" id="close">Close</button>`, root => {
    root.querySelector("#close").onclick = closeSheet;
    root.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => {
      const p = rows.find(x => x.id === Number(b.dataset.pay));
      openSheet(`<h2 style="margin-top:0">Payout for ${monthLabel(p.period_month.slice(0, 7))}</h2>
        <form id="f"><div class="two"><label class="field"><span>Date received</span><input name="d" type="date" value="${ymd(new Date())}" required></label>
        <label class="field"><span>Amount received (RM)</span><input name="a" type="number" step="0.01" value="${p.net_amount}" required></label></div>
        <button class="btn primary block">Mark paid</button></form>`, root2 => root2.querySelector("#f").onsubmit = async e => {
        e.preventDefault(); const f = new FormData(e.target);
        try { await q(sb.from("payouts").update({ paid: true, paid_on: f.get("d"), paid_amount: Number(f.get("a")) }).eq("id", p.id)); toast("Payout recorded"); payoutsSheet(r); } catch (err) { fail(err); }
      });
    });
  });
}

/* =========================================================
   STOCK
   ========================================================= */
function renderStock() {
  const view = $("#view");
  const places = [workshop(), ...retailers(), ...state.locations.filter(l => l.type === "market" && l.active)].filter(Boolean);
  const L = state.stockLoc, s = state.search.toLowerCase();
  const rows = state.products.map(p => ({ p, n: stockAt(L, p.sku) }))
    .filter(x => (x.p.status === "Active" || x.n !== 0) && (!s || x.p.name.toLowerCase().includes(s) || (x.p.family || "").toLowerCase().includes(s) || (x.p.category || "").toLowerCase().includes(s)));
  view.innerHTML = `<h1 class="big">Your<br>stock</h1>
    <div class="chips"><button class="chip" data-l="all" aria-pressed="${L === "all"}">All places · ${stockTotalAt("all")}</button>
    ${places.map(l => `<button class="chip" data-l="${l.id}" aria-pressed="${String(L) === String(l.id)}">${esc(l.name)} · ${stockTotalAt(l.id)}</button>`).join("")}</div>
    <button class="btn primary block" id="newItem" style="margin-bottom:10px">+ New item</button>
    <div class="btns"><button class="btn" id="add">Add pieces</button><button class="btn" id="move">Move stock</button><button class="btn" id="products">All items</button></div>
    <button class="btn block" id="stockReport" style="margin:-4px 0 12px">Print or share stock report</button>
    <input class="search" id="search" type="search" placeholder="Search pieces" value="${esc(state.search)}">
    ${groupByCategory(rows.map(x => x.p)).map(([cat, ps]) => {
      const n = ps.reduce((t, p) => t + Math.max(0, stockAt(L, p.sku)), 0);
      return `<details class="group" data-cat="${esc(cat)}" ${s || state.openCats.has(cat) ? "open" : ""}><summary>${catIco(cat)}<span class="grow">${esc(cat)}<span class="small muted" style="display:block;font-weight:500">${ps.length} item${ps.length > 1 ? "s" : ""}</span></span><span class="count">${n}</span>${CHEV}</summary>
      <div class="inner">${ps.map(p => { const k = stockAt(L, p.sku);
        const where = L === "all" ? places.map(l => [l, stockAt(l.id, p.sku)]).filter(([, q]) => q).map(([l, q]) => `${esc(l.name)} ${q}`).join(" · ") : "";
        return `<div class="row" data-sku="${p.sku}"><div class="grow"><div class="title" style="white-space:normal">${esc(p.name)}</div><div class="small muted">${[p.size && p.size !== "Free" ? esc(p.size) : null, p.status !== "Active" ? esc(p.status) : null, where || null].filter(Boolean).join(" · ")}</div></div>
          <span class="num" style="font-size:18px;font-weight:700;${k <= 0 ? "color:var(--rust)" : ""}">${k}${isPair(p) ? `<span class="small muted" style="font-weight:500"> ${unitWord(p, k)}</span>` : ""}</span></div>`; }).join("")}</div></details>`;
    }).join("") || `<div class="empty">Nothing here.</div>`}
    <p class="small muted">Tap a category to open it, then tap an item to fix its count.</p>`;
  view.querySelectorAll("details[data-cat]").forEach(d => d.ontoggle = () => { if (s) return; d.open ? state.openCats.add(d.dataset.cat) : state.openCats.delete(d.dataset.cat); });
  view.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { state.stockLoc = b.dataset.l === "all" ? "all" : Number(b.dataset.l); render(); });
  $("#search").oninput = e => { state.search = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#search"); i.focus(); i.setSelectionRange(pos, pos); };
  $("#add").onclick = () => moveSheet({ to: L === "all" ? workshop().id : L, from: null, title: "Add new pieces", restock: true });
  $("#move").onclick = () => moveSheet({ from: workshop().id, to: retailers()[0]?.id, title: "Move stock" });
  $("#products").onclick = productsSheet;
  $("#stockReport").onclick = () => stockReportSheet(L);
  $("#newItem").onclick = () => productForm(null);
  view.querySelectorAll("[data-sku]").forEach(r => r.onclick = () => adjustSheet(prod(r.dataset.sku), L === "all" ? workshop().id : L));
}

/* =========================================================
   STOCK REPORT — print / save as PDF, or share (email, WhatsApp…)
   ========================================================= */
function stockReportData(L) {
  const places = (L === "all" ? [workshop(), ...retailers(), ...state.locations.filter(l => l.type === "market" && l.active)] : [loc(L)]).filter(Boolean);
  return places.map(l => {
    const shop = l.type === "retailer", price = sku => shop ? shopPrice(l.id, sku) : Number(prod(sku)?.retail_price || 0);
    const ps = state.products.filter(p => stockAt(l.id, p.sku) > 0);
    const cats = groupByCategory(ps).map(([cat, list]) => {
      const rows = sizeGroups(list, l.id).sort((a, b) => a.name.localeCompare(b.name)).map(g => {
        const its = g.items.filter(it => it.left > 0), qty = its.reduce((t, it) => t + it.left, 0);
        const together = shop && sharedSkus(l.id, g.items[0].p.sku).length > 1;
        const sizes = g.items.length > 1 || sizeShort(g.items[0].p.size) ? (together ? "all sizes" : its.map(it => `${it.size}\u00a0${it.left}`).join(", ")) : "";
        const code = shop && usesCodes(l) ? [...new Set(its.map(it => codeAt(l.id, it.p.sku)).filter(Boolean))].join(", ") : "";
        const prices = [...new Set(its.map(it => price(it.p.sku)))];
        const lead = g.items[0].p, name = sizeShort(lead.size) ? nice(baseName(lead.short_name || lead.name)) : g.name;   /* design name; sizes have their own column */
        return { name, sizes, code, qty, price: prices.length === 1 ? prices[0] : null, value: its.reduce((t, it) => t + it.left * price(it.p.sku), 0) };
      });
      return { cat, rows, qty: rows.reduce((t, r) => t + r.qty, 0), value: rows.reduce((t, r) => t + r.value, 0) };
    });
    return { l, shop, cats, qty: cats.reduce((t, c) => t + c.qty, 0), value: cats.reduce((t, c) => t + c.value, 0) };
  }).filter(x => x.qty > 0 || L !== "all");
}
function stockReportText(L, data, when) {
  const lines = [`Apolaki stock report · ${L === "all" ? "all places" : data[0]?.l.name || ""}`, when, ""];
  for (const pl of data) {
    if (data.length > 1) lines.push(`== ${pl.l.name}: ${pl.qty} pieces · ${RM(pl.value)} ==`);
    for (const c of pl.cats) { lines.push(`${(CAT_PLURAL[c.cat] || c.cat).toUpperCase()} (${c.qty}${/earring/i.test(c.cat) ? " pairs" : ""})`); c.rows.forEach(r => lines.push(`• ${r.name}${r.code ? ` [${r.code}]` : ""}${r.sizes ? ` (${r.sizes})` : ""}: ${r.qty}`)); lines.push(""); }
  }
  const T = data.reduce((t, x) => t + x.qty, 0), V = data.reduce((t, x) => t + x.value, 0);
  lines.push(`Total: ${T} pieces · ${RM(V)}`);
  return lines.join("\n");
}
function stockReportHtml(L, data, when) {
  const T = data.reduce((t, x) => t + x.qty, 0), V = data.reduce((t, x) => t + x.value, 0);
  return `<div class="rep">
    <div class="rep-head"><div><div class="rep-brand">APOLAKI</div><div class="rep-title">Stock report · ${esc(L === "all" ? "all places" : data[0]?.l.name || "")}</div></div><div class="rep-when">${esc(when)}</div></div>
    ${data.length > 1 ? `<table class="rep-t"><tr><th>Place</th><th class="r">Pieces</th><th class="r">Value</th></tr>${data.map(pl => `<tr><td>${esc(pl.l.name)}</td><td class="r">${pl.qty}</td><td class="r">${RM(pl.value)}</td></tr>`).join("")}
      <tr class="tot"><td>Total</td><td class="r">${T}</td><td class="r">${RM(V)}</td></tr></table>` : ""}
    ${data.map(pl => { const anyCode = pl.cats.some(c => c.rows.some(r => r.code)); return `<h3 class="rep-place">${esc(pl.l.name)} <span>${pl.qty} pieces · ${RM(pl.value)}${pl.shop ? " at shop prices" : ""}</span></h3>
      ${pl.cats.length ? `<table class="rep-t"><tr><th>Item</th>${anyCode ? "<th>Code</th>" : ""}<th>Sizes</th><th class="r">Qty</th><th class="r c-price">Price</th><th class="r">Value</th></tr>
        ${pl.cats.map(c => `<tr class="cat"><td colspan="${anyCode ? 6 : 5}">${esc(CAT_PLURAL[c.cat] || c.cat)} · ${c.qty}${/earring/i.test(c.cat) ? " pairs" : ""}</td></tr>${c.rows.map(r => `<tr><td>${esc(r.name)}</td>${anyCode ? `<td>${esc(r.code)}</td>` : ""}<td>${esc(r.sizes)}</td><td class="r">${r.qty}</td><td class="r c-price">${r.price == null ? "mixed" : RM(r.price)}</td><td class="r">${RM(r.value)}</td></tr>`).join("")}`).join("")}
        <tr class="tot"><td colspan="${anyCode ? 3 : 2}">Total</td><td class="r">${pl.qty}</td><td class="c-price"></td><td class="r">${RM(pl.value)}</td></tr></table>` : `<p class="small muted">No stock here.</p>`}`; }).join("")}
    <p class="rep-foot">${state.name ? `Prepared by ${esc(state.name)} · ` : ""}Values use ${data.some(pl => pl.shop) ? "each shop's price for shop stock and the original price elsewhere" : "the original price"}.</p></div>`;
}

/* ---- tiny PDF writer for the stock report (no outside library): A4, Helvetica, tables, page breaks ---- */
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const HELVB = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
/* text -> WinAnsi bytes (as a latin1 string) */
const pdfEnc = t => String(t ?? "").replace(/ /g, " ").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/–/g, "\x96").replace(/—/g, "\x97").replace(/−/g, "-").replace(/·/g, "\xb7").replace(/[^\x20-\x7e\x96\x97\xb7]/g, "?");
const pdfW = (t, size, bold) => { const W = bold ? HELVB : HELV; let w = 0; for (const ch of pdfEnc(t)) { const c = ch.charCodeAt(0); w += c >= 32 && c <= 126 ? W[c - 32] : c === 0xb7 ? 278 : 556; } return w * size / 1000; };
function pdfWrap(t, width, size, bold) {
  const out = []; let line = "";
  for (const word of String(t ?? "").split(/\s+/).filter(Boolean)) {
    const tryL = line ? line + " " + word : word;
    if (pdfW(tryL, size, bold) <= width || !line) line = tryL; else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out.length ? out : [""];
}
function stockReportPdf(L, data, when) {
  const PW = 595.28, PH = 841.89, M = 40, CW = PW - 2 * M, pages = []; let ops = [], y = 0;
  const esc = t => pdfEnc(t).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const txt = (t, x, yy, size, bold, gray, align) => { const w = pdfW(t, size, bold); const xx = align === "r" ? x - w : x;
    ops.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${gray ? "0.42 0.47 0.53 rg" : "0.1 0.12 0.15 rg"} ${xx.toFixed(2)} ${(PH - yy).toFixed(2)} Td (${esc(t)}) Tj ET`); };
  const hline = (yy, wdt, g) => ops.push(`${g ?? 0.82} G ${wdt || 0.5} w ${M} ${(PH - yy).toFixed(2)} m ${PW - M} ${(PH - yy).toFixed(2)} l S`);
  const box = (yy, h, g) => ops.push(`${g} g ${M} ${(PH - yy - h).toFixed(2)} ${CW} ${h.toFixed(2)} re f`);
  const place = L === "all" ? "all places" : data[0]?.l.name || "";
  const newPage = first => {
    if (ops.length) pages.push(ops);
    ops = []; y = M;
    if (first) {
      txt("APOLAKI", M, y + 14, 16, true); txt(`Stock report · ${place}`, M, y + 32, 11, true); txt(when, PW - M, y + 32, 9, false, true, "r");
      hline(y + 40, 1.4, 0.1); y += 56;
    } else { txt(`Apolaki stock report · ${place} (continued)`, M, y + 10, 9, false, true); y += 24; }
  };
  const need = h => { if (y + h > PH - M - 20) { newPage(false); return true; } return false; };
  newPage(true);
  const T = data.reduce((t, x) => t + x.qty, 0), V = data.reduce((t, x) => t + x.value, 0);
  /* summary per place */
  if (data.length > 1) {
    const cols = [[M, "PLACE", ""], [M + CW - 120, "PIECES", "r"], [M + CW, "VALUE", "r"]];
    cols.forEach(([x, h, a]) => txt(h, x, y + 10, 7.5, true, true, a)); y += 16; hline(y);
    for (const pl of data) { txt(pl.l.name, M, y + 13, 9.5); txt(String(pl.qty), M + CW - 120, y + 13, 9.5, false, false, "r"); txt(RM(pl.value), M + CW, y + 13, 9.5, false, false, "r"); y += 19; hline(y); }
    txt("Total", M, y + 14, 9.5, true); txt(String(T), M + CW - 120, y + 14, 9.5, true, false, "r"); txt(RM(V), M + CW, y + 14, 9.5, true, false, "r"); y += 30;
  }
  for (const pl of data) {
    const anyCode = pl.cats.some(c => c.rows.some(r => r.code));
    /* columns: [x, width, align, header, field] */
    const C = anyCode
      ? [[0, 160, "", "ITEM", "name"], [164, 92, "", "CODE", "code"], [260, 86, "", "SIZES", "sizes"], [350, 30, "r", "QTY", "qty"], [384, 63, "r", "PRICE", "price"], [451, 64, "r", "VALUE", "value"]]
      : [[0, 214, "", "ITEM", "name"], [218, 128, "", "SIZES", "sizes"], [350, 30, "r", "QTY", "qty"], [384, 63, "r", "PRICE", "price"], [451, 64, "r", "VALUE", "value"]];
    const head = () => { C.forEach(([x, w, a, h]) => txt(h, M + x + (a === "r" ? w : 0), y + 10, 7.5, true, true, a)); y += 15; hline(y, 0.6); };
    need(60);
    txt(pl.l.name, M, y + 14, 12, true); txt(`${pl.qty} pieces · ${RM(pl.value)}${pl.shop ? " at shop prices" : ""}`, M + pdfW(pl.l.name, 12, true) + 8, y + 14, 9, false, true); y += 24;
    if (!pl.cats.length) { txt("No stock here.", M, y + 10, 9, false, true); y += 22; continue; }
    head();
    for (const c of pl.cats) {
      if (need(40)) head();
      box(y, 18, 0.94); txt(`${CAT_PLURAL[c.cat] || c.cat} · ${c.qty}${/earring/i.test(c.cat) ? " pairs" : ""}`, M + 4, y + 12.5, 9, true); y += 18;
      for (const r of c.rows) {
        const vals = { name: r.name, code: r.code, sizes: r.sizes, qty: String(r.qty), price: r.price == null ? "mixed" : RM(r.price), value: RM(r.value) };
        const cells = C.map(([x, w, a, , f]) => ({ x, w, a, lines: a === "r" ? [vals[f]] : pdfWrap(vals[f], w, 9) }));
        const h = Math.max(...cells.map(c2 => c2.lines.length)) * 11 + 7;
        if (need(h)) head();
        cells.forEach(c2 => c2.lines.forEach((ln, i) => txt(ln, M + c2.x + (c2.a === "r" ? c2.w : 0), y + 12 + i * 11, 9, false, false, c2.a)));
        y += h; hline(y, 0.4, 0.86);
      }
    }
    need(26); hline(y, 1.1, 0.1);
    const qx = C.find(c2 => c2[4] === "qty"), vx = C.find(c2 => c2[4] === "value");
    txt("Total", M, y + 14, 9.5, true); txt(String(pl.qty), M + qx[0] + qx[1], y + 14, 9.5, true, false, "r"); txt(RM(pl.value), M + vx[0] + vx[1], y + 14, 9.5, true, false, "r"); y += 34;
  }
  need(20);
  txt(`${state.name ? `Prepared by ${state.name} · ` : ""}Values use ${data.some(pl => pl.shop) ? "each shop's price for shop stock and the original price elsewhere" : "the original price"}.`, M, y + 8, 8, false, true);
  pages.push(ops);
  /* page numbers */
  pages.forEach((p, i) => { ops = p; txt(`Page ${i + 1} of ${pages.length}`, PW - M, PH - M + 14, 8, false, true, "r"); });
  /* assemble the file */
  const objs = [];
  const add = s2 => { objs.push(s2); return objs.length; };
  const catalog = add(""), pagesObj = add(""), f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"), f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = pages.map(p => { const content = p.join("\n"); const cs = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
    return add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cs} 0 R >>`); });
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objs[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map(k => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"; const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map(o => String(o).padStart(10, "0") + " 00000 n \n").join("")}trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info << /Title (${esc(`Apolaki stock report - ${place}`)}) /Producer (Apolaki) >> >>\nstartxref\n${xref}\n%%EOF`;
  const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
  return new Blob([bytes], { type: "application/pdf" });
}
function stockReportSheet(L) {
  const now = new Date(), when = now.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" }) + ", " + now.toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" });
  const data = stockReportData(L), text = stockReportText(L, data, when), html = stockReportHtml(L, data, when);
  const title = `Apolaki stock report · ${L === "all" ? "all places" : data[0]?.l.name || ""} · ${now.toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}`;
  const canShare = !!navigator.share;
  openSheet(`
    <h2>Stock report</h2>
    <p class="small muted" style="margin-top:-6px">${L === "all" ? "All places." : `Only ${esc(data[0]?.l.name || "")}.`} To report another place, pick it on the Stock tab first.</p>
    <div class="btns"><button class="btn primary" id="rShare">${canShare ? "Share PDF" : "Download PDF"}</button><button class="btn" id="rPrint">Print</button>${canShare ? `<button class="btn" id="rDown">Download PDF</button>` : ""}</div>
    <button type="button" class="link" id="rText" style="margin:2px 2px 10px">Share as text instead</button>
    <div class="card rep-card">${html}</div>`, root => {
    root.querySelector("#rPrint").onclick = () => {
      let area = document.getElementById("printArea"); if (!area) { area = document.createElement("div"); area.id = "printArea"; document.body.append(area); }
      area.innerHTML = html; document.body.classList.add("printing"); document.title = title;
      const done = () => { document.body.classList.remove("printing"); document.title = "Apolaki"; window.removeEventListener("afterprint", done); };
      window.addEventListener("afterprint", done); setTimeout(() => window.print(), 50);
    };
    const fileName = `Apolaki stock ${L === "all" ? "all places" : (data[0]?.l.name || "")} ${ymd(now)}.pdf`.replace(/[\/:*?"<>|]/g, "");
    const pdfFile = () => new File([stockReportPdf(L, data, when)], fileName, { type: "application/pdf" });
    const download = () => { const url = URL.createObjectURL(pdfFile()); const a = Object.assign(document.createElement("a"), { href: url, download: fileName }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
    /* share the PDF itself (email, WhatsApp…); if this device can't share files, download it instead */
    root.querySelector("#rShare").onclick = async () => {
      const f = pdfFile();
      if (navigator.canShare && navigator.canShare({ files: [f] })) { try { await navigator.share({ files: [f], title }); } catch (e) { if (e.name !== "AbortError") { toast("Couldn't share, so it's downloading instead"); download(); } } }
      else download();
    };
    const dl = root.querySelector("#rDown"); if (dl) dl.onclick = download;
    root.querySelector("#rText").onclick = async () => {
      if (navigator.share) { try { await navigator.share({ title, text }); } catch (e) { if (e.name !== "AbortError") toast("Couldn't open sharing on this device"); } }
      else location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text.slice(0, 1800))}`;
    };
  });
}

function locOptions(sel, includeNone) {
  const opts = state.locations.filter(l => l.active || l.id === Number(sel));
  return (includeNone ? `<option value="">New pieces (not from anywhere)</option>` : "") + opts.map(l => `<option value="${l.id}" ${Number(sel) === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("");
}

function moveSheet({ from, to, title, restock, focus }) {
  /* grouped by category, A to Z; each design is one row with a box per size */
  const first = new Set(focus || []);
  const cats = groupByCategory(activeProducts()).map(([cat, ps]) => {
    const gs = sizeGroups(ps, "all").sort((a, b) => first.size && (b.items.some(it => first.has(it.p.sku)) - a.items.some(it => first.has(it.p.sku))) || a.name.localeCompare(b.name));
    return { cat, gs, hot: gs.some(g => g.items.some(it => first.has(it.p.sku))) };
  });
  const box = (it, multi) => `<label class="mv-box"><span>${esc(multi ? it.size || "—" : isPair(it.p) ? "pairs" : "qty")}</span>
      <input type="number" inputmode="numeric" min="0" step="1" data-sku="${it.p.sku}" placeholder="0"><small data-have="${it.p.sku}"></small></label>`;
  const design = g => { const multi = g.items.length > 1 || !!sizeShort(g.items[0].p.size), hot = g.items.some(it => first.has(it.p.sku));
    return `<div class="mv-row${hot ? " hot" : ""}${multi ? "" : " one"}" data-name="${esc(g.name.toLowerCase())}"><div class="mv-name">${esc(g.name)}${hot ? ` <span class="tag">low</span>` : ""}${!multi && g.items[0].p.size && g.items[0].p.size !== "Free" ? `<span class="small muted"> · ${esc(g.items[0].p.size)}</span>` : ""}</div>
      <div class="mv-boxes">${g.items.map(it => box(it, multi)).join("")}</div></div>`; };
  openSheet(`
    <h2 style="margin-top:0">${esc(title)}</h2>
    <div class="two">
      <label class="field"><span>From</span><select id="from">${restock ? `<option value="">New pieces</option>` : locOptions(from, true)}</select></label>
      <label class="field"><span>To</span><select id="to">${locOptions(to)}</select></label></div>
    <div class="two"><label class="field"><span>Date</span><input id="d" type="date" value="${ymd(new Date())}"></label>
    <label class="field"><span>Reference</span><input id="ref" placeholder="OCT-01"></label></div>
    <input class="search" id="flt" type="search" placeholder="Search pieces">
    <div id="pick">${cats.map(c => `<details class="group mv-cat" data-cat="${esc(c.cat)}" ${c.hot || cats.length === 1 ? "open" : ""}><summary>${catIco(c.cat)}<span class="grow">${esc(CAT_PLURAL[c.cat] || c.cat)}<span class="small muted mv-sum" style="display:block;font-weight:500">${c.gs.length} design${c.gs.length > 1 ? "s" : ""}${/earring/i.test(c.cat) ? " · counted in pairs" : ""}</span></span><span class="count" data-catn></span>${CHEV}</summary>
      <div class="inner">${c.gs.map(design).join("")}</div></details>`).join("")}</div>
    <div class="mv-bar"><button class="btn primary block" id="go">Save</button></div>`, root => {
    const showHave = () => { const f = root.querySelector("#from").value; root.querySelectorAll("[data-have]").forEach(e => e.textContent = f ? `${stockAt(Number(f), e.dataset.have)} there` : ""); };
    const total = () => {
      const picked = [...root.querySelectorAll("[data-sku]")].map(i => ({ p: prod(i.dataset.sku), qty: parseInt(i.value, 10) || 0 })).filter(x => x.qty > 0);
      root.querySelector("#go").textContent = picked.length ? `Save ${countWords(picked)}` : "Save";
      root.querySelectorAll("details[data-cat]").forEach(d => { const n = [...d.querySelectorAll("[data-sku]")].reduce((t, i) => t + (parseInt(i.value, 10) || 0), 0); d.querySelector("[data-catn]").textContent = n ? `+${n}` : ""; });
    };
    root.querySelector("#from").onchange = showHave; showHave();
    root.querySelectorAll("[data-sku]").forEach(i => { i.oninput = () => { i.closest(".mv-box").classList.toggle("on", (parseInt(i.value, 10) || 0) > 0); total(); }; });
    root.querySelector("#flt").oninput = e => {
      const s = e.target.value.trim().toLowerCase();
      root.querySelectorAll("details[data-cat]").forEach(d => {
        let any = false; d.querySelectorAll(".mv-row").forEach(r => { const hit = !s || r.dataset.name.includes(s); r.hidden = !hit; any = any || hit; });
        d.hidden = !any; if (s) d.open = true;
      });
    };
    root.querySelector("#go").onclick = async () => {
      const f = root.querySelector("#from").value, t = root.querySelector("#to").value;
      if (f && f === t) return toast("From and To are the same place");
      const rows = [...root.querySelectorAll("[data-sku]")].map(i => ({ sku: i.dataset.sku, qty: parseInt(i.value, 10) || 0 })).filter(x => x.qty > 0)
        .map(x => ({ ...x, moved_on: root.querySelector("#d").value, from_location: f ? Number(f) : null, to_location: Number(t), reason: f ? (loc(t)?.type === "workshop" ? "return" : "transfer") : "restock", ref: root.querySelector("#ref").value || null }));
      if (!rows.length) return toast("Enter a quantity for at least one piece");
      try { await q(sb.from("stock_movements").insert(rows)); await loadStock(); closeSheet(); toast(`${countWords(rows.map(r => ({ p: prod(r.sku), qty: r.qty })))} saved`); render(); } catch (e) { fail(e); }
    };
  });
}

function adjustSheet(p, at) {
  openSheet(`
    <h2 style="margin-top:0">${esc(p.name)}</h2>
    <p class="muted small">${esc(itemSub(p))}${itemSub(p) ? " · " : ""}${RM(p.retail_price)}</p>
    <label class="field"><span>Place</span><select id="at">${locOptions(at)}</select></label>
    <p>App count here: <strong id="have">${stockAt(at, p.sku)}</strong>${isPair(p) ? " pairs" : ""}</p>
    <div class="two"><label class="field"><span>Real count${isPair(p) ? " (pairs)" : ""}</span><input id="real" type="number" inputmode="numeric" step="1"></label>
    <label class="field"><span>Reason</span><select id="why"><option value="correction">Count correction</option><option value="loss">Lost or damaged</option></select></label></div>
    <label class="field"><span>Note</span><input id="note"></label>
    <button class="btn primary block" id="go">Save count</button>`, root => {
    root.querySelector("#at").onchange = e => root.querySelector("#have").textContent = stockAt(Number(e.target.value), p.sku);
    root.querySelector("#go").onclick = async () => {
      const L = Number(root.querySelector("#at").value), have = stockAt(L, p.sku), real = parseInt(root.querySelector("#real").value, 10);
      if (Number.isNaN(real)) return toast("Enter the real count");
      if (real === have) { closeSheet(); return toast("Count already matches"); }
      const row = real > have ? { to_location: L, qty: real - have } : { from_location: L, qty: have - real };
      try { await q(sb.from("stock_movements").insert({ ...row, sku: p.sku, reason: root.querySelector("#why").value, notes: root.querySelector("#note").value || null })); await loadStock(); closeSheet(); toast("Count saved"); render(); } catch (e) { fail(e); }
    };
  });
}

let itemsTab = "Active";
function productsSheet() {
  const ORDER = ["Active", "Paused", "Replaced", "Discontinued"];
  const groups = {}; state.products.forEach(p => (groups[p.status || "Active"] = groups[p.status || "Active"] || []).push(p));
  const tabs = [...ORDER.filter(k => groups[k]), ...Object.keys(groups).filter(k => !ORDER.includes(k)).sort()];
  if (!groups[itemsTab]) itemsTab = tabs[0] || "Active";
  const row = p => `<div class="row" data-sku="${p.sku}" data-name="${esc(p.name.toLowerCase())}"><div class="grow"><div class="title" style="white-space:normal">${esc(p.name)}</div><div class="small muted">${esc(itemSub(p))}</div></div><span class="num">${RM(p.retail_price)}</span></div>`;
  openSheet(`
    <h2>All items</h2>
    <div class="two-btn" style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button class="btn primary block" id="new">+ New item</button><button class="btn block" id="table">Edit as table</button></div>
    <div class="ttabs" style="margin-top:16px">${tabs.map(k => `<button type="button" data-st="${esc(k)}" aria-pressed="${k === itemsTab}">${esc(k)} <span class="muted">${groups[k].length}</span></button>`).join("")}</div>
    <input class="search" id="flt" type="search" placeholder="Search items">
    <div class="list tight" id="itemList" style="margin-top:10px"></div>`, root => {
    const draw = () => {
      const s = root.querySelector("#flt").value.trim().toLowerCase();
      const list = (s ? state.products : groups[itemsTab] || []).filter(p => !s || p.name.toLowerCase().includes(s) || String(p.sku).toLowerCase().includes(s))
        .slice().sort((a, b) => a.name.localeCompare(b.name));
      root.querySelector("#itemList").innerHTML = list.length ? list.map(p => s && p.status !== "Active" ? row(p).replace(`${esc(itemSub(p))}</div>`, `${esc(itemSub(p))} · ${esc(p.status)}</div>`) : row(p)).join("") : `<div class="small muted" style="padding:12px 2px">No items here.</div>`;
      root.querySelectorAll("#itemList [data-sku]").forEach(r => r.onclick = () => productForm(prod(r.dataset.sku)));
    };
    root.querySelectorAll("[data-st]").forEach(b => b.onclick = () => { itemsTab = b.dataset.st; root.querySelectorAll("[data-st]").forEach(x => x.setAttribute("aria-pressed", x === b)); root.querySelector("#flt").value = ""; draw(); });
    root.querySelector("#flt").oninput = draw;
    root.querySelector("#new").onclick = () => productForm(null);
    root.querySelector("#table").onclick = itemsTableSheet;
    draw();
  });
}
const NEW_SIZES = [["XS", "Extra Small"], ["S", "Small"], ["M", "Medium"], ["L", "Large"], ["XL", "Extra Large"]];
function productForm(p) {
  const v = p || { status: "Active" };
  const field = (k, label, type = "text", ph = "") => `<label class="field"><span>${label}</span><input name="${k}" type="${type}" ${type === "number" ? 'step="0.01" min="0" inputmode="decimal"' : ""} placeholder="${ph}" value="${esc(v[k] ?? "")}"></label>`;
  const list = (k, vals) => `<datalist id="dl-${k}">${[...new Set(state.products.map(x => x[k]).filter(Boolean))].sort().map(x => `<option value="${esc(x)}">`).join("")}</datalist>`;
  const withList = (k, label, ph) => field(k, label, "text", ph).replace("<input ", `<input list="dl-${k}" `) + list(k);
  const codes = p ? state.codes.filter(c => c.sku === p.sku).map(c => `${esc(loc(c.location_id)?.name)}: ${esc(c.code || "no code")}${c.price != null ? " at " + RM(c.price) : ""}`).join(" · ") : "";
  openSheet(`
    <h2>${p ? "Edit item" : "New item"}</h2>
    <form id="f">
      ${field("name", p ? "Item name" : "Item name (without the size)", "text", p ? "Twisting Liana Vines Bracelet (Small)" : "Twisting Liana Vines Bracelet")}
      <div class="two">${withList("family", "Family", "TLV Bracelet")}${withList("collection", "Collection", "TLV")}</div>
      <div class="two">${withList("category", "Category", "Bracelet")}${p ? withList("size", "Size", "Small") : ""}</div>
      ${p ? "" : `<label class="field"><span>Sizes</span></label>
        <div class="chips size-pick" style="margin-top:-4px">${NEW_SIZES.map(([sh, full]) => `<button type="button" class="chip" data-size="${sh}" aria-pressed="false">${sh}</button>`).join("")}</div>
        <p class="small muted" style="margin:-4px 2px 12px" id="sizeNote">No size ticked = one item. Tick sizes and each size is saved as its own item.</p>`}
      <div class="two">${field("retail_price", p ? "Original price (RM)" : "Price (RM)", "number")}
        <label class="field"><span>Status</span><select name="status">${["Active", "Paused", "Replaced", "Discontinued"].map(s => `<option ${v.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
      ${p ? "" : `<div id="sizeRows"></div><label class="field" id="startOne"><span>Pieces in Workshop now</span><input name="start_qty" type="number" min="0" step="1" inputmode="numeric" placeholder="0"></label>`}
      <label class="field"><span>Photo (optional)</span></label>
      <div class="photo-pick">
        <div class="photo-box" id="photoBox">${photo(v) ? `<img src="${esc(photo(v))}" alt="">` : `<div class="ph ${catG(v.category)}">${catSvg(v.category)}</div>`}</div>
        <div class="photo-btns">
          <label class="btn">Take photo<input type="file" accept="image/*" capture="environment" id="camIn" hidden></label>
          <label class="btn">Choose photo<input type="file" accept="image/*" id="picIn" hidden></label>
          ${v.photo ? `<button type="button" class="link" id="noPhoto" style="color:var(--rust)">Remove photo</button>` : ""}
        </div>
      </div>
      <input type="hidden" name="photo" id="photoVal" value="${esc(v.photo || "")}">
      ${field("notes", "Notes (optional)")}
      <label class="row" style="margin:4px 0 12px;cursor:pointer"><div class="grow"><div class="title">Show on the online shop</div><div class="small muted">Customers can see and order it (needs status Active and a price)</div></div><input type="checkbox" name="show_online" ${v.show_online ? "checked" : ""} style="width:22px;height:22px;min-height:0;flex:none;padding:0;box-shadow:none;accent-color:var(--accent)"></label>
      <label class="field"><span>Shop description (optional)</span><textarea name="web_description" rows="3" style="min-height:84px;font-family:inherit;font-size:13.5px" placeholder="A line or two for customers: materials, size, how it's made">${esc(v.web_description || "")}</textarea></label>
      <div class="two"><label class="field"><span>Material (shop)</span><input name="material" placeholder="e.g. Brass" value="${esc(v.material || "")}"></label>
        <label class="field"><span>Dimensions (shop)</span><input name="dimensions" placeholder="e.g. Drop 4.5 cm" value="${esc(v.dimensions || "")}"></label></div>
      <p class="small muted" style="margin-top:-4px">Used at markets and online. Each shop's own price is set on that shop's page.</p>
      ${codes ? `<p class="small muted">Shops: ${codes}</p>` : ""}
      <button class="btn primary block">${p ? "Save item" : "Add item"}</button>
    </form>
    ${p ? `<div id="delMsg"></div><button type="button" class="btn danger block" id="delItem" style="margin-top:10px">Delete item</button>` : ""}`, root => {
    let busy = false;
    /* new item: tick sizes -> one row per size with its own price (defaults to the main price) and pieces in Workshop */
    const picked = [], priceTouched = {};
    const drawSizes = () => {
      const box = root.querySelector("#sizeRows"); if (!box) return;
      const base = root.querySelector("[name=retail_price]").value;
      box.innerHTML = picked.length ? `<div class="card" style="padding:10px 14px;margin:0 0 12px"><table class="simple size-tbl"><tr><th>Size</th><th>Price (RM)</th><th>In Workshop</th></tr>${picked.map(sh => `<tr><td><b>${sh}</b></td>
        <td><input data-sp="${sh}" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(priceTouched[sh] ?? base)}"></td>
        <td><input data-sq="${sh}" type="number" step="1" min="0" inputmode="numeric" placeholder="0" value="${esc((box.dataset["q" + sh]) || "")}"></td></tr>`).join("")}</table></div>` : "";
      box.querySelectorAll("[data-sp]").forEach(i => i.oninput = () => { priceTouched[i.dataset.sp] = i.value; });
      box.querySelectorAll("[data-sq]").forEach(i => i.oninput = () => { box.dataset["q" + i.dataset.sq] = i.value; });
      root.querySelector("#startOne").hidden = !!picked.length;
      root.querySelector("#sizeNote").textContent = picked.length ? `${picked.length} item${picked.length > 1 ? "s" : ""} will be created: ${picked.map(sh => sh).join(", ")}.` : "No size ticked = one item. Tick sizes and each size is saved as its own item.";
    };
    root.querySelectorAll("[data-size]").forEach(b => b.onclick = () => {
      const sh = b.dataset.size, i = picked.indexOf(sh);
      if (i >= 0) picked.splice(i, 1); else picked.push(sh);
      picked.sort((a, c) => NEW_SIZES.findIndex(x => x[0] === a) - NEW_SIZES.findIndex(x => x[0] === c));
      b.setAttribute("aria-pressed", i < 0); drawSizes();
    });
    if (!p) root.querySelector("[name=retail_price]").addEventListener("input", drawSizes);
    /* delete = hide (kept in the database). Only for items with no sales or stock history; others should be set to Discontinued */
    const del = root.querySelector("#delItem");
    if (del) del.onclick = async () => {
      try {
        const [sold, moved] = await Promise.all([q(live("sales", "id").eq("sku", p.sku).limit(1)), q(sb.from("stock_movements").select("id").eq("sku", p.sku).limit(1))]);
        if (sold.length || moved.length || stockAt("all", p.sku) !== 0) {
          root.querySelector("#delMsg").innerHTML = `<div class="warn-banner" style="margin-top:12px">${esc(p.name)} has ${sold.length ? "sales" : "stock"} history, so deleting it would break past records. Set its status to <b>Discontinued</b> instead: it stays out of selling and restock advice, and the history keeps its name.</div>`;
          return;
        }
        if (!confirm(`Delete ${p.name}? It disappears from the app.`)) return;
        await q(sb.from("products").update({ deleted_at: new Date().toISOString() }).eq("sku", p.sku));
        await loadAll(); closeSheet(); toast(`${p.name} deleted`); render();
      } catch (err) { fail(err); }
    };
    const pick = async inp => {
      const file = inp.files && inp.files[0]; if (!file) return;
      busy = true; root.querySelector("#photoBox").innerHTML = `<div class="skeleton" style="height:100%;margin:0"></div>`;
      try { const url = await uploadPhoto(file); root.querySelector("#photoVal").value = url; root.querySelector("#photoBox").innerHTML = `<img src="${esc(url)}" alt="">`; toast("Photo added"); }
      catch (err) { root.querySelector("#photoBox").innerHTML = ""; fail(err); }
      busy = false; inp.value = "";
    };
    root.querySelector("#camIn").onchange = e => pick(e.target);
    root.querySelector("#picIn").onchange = e => pick(e.target);
    const np = root.querySelector("#noPhoto"); if (np) np.onclick = () => { root.querySelector("#photoVal").value = ""; root.querySelector("#photoBox").innerHTML = `<div class="ph ${catG(v.category)}">${catSvg(v.category)}</div>`; np.remove(); };
    root.querySelector("#f").onsubmit = async e => {
      e.preventDefault();
      if (busy) return toast("Wait for the photo to finish uploading");
      const f = Object.fromEntries(new FormData(e.target));
      const start = parseInt(f.start_qty, 10) || 0; delete f.start_qty;
      for (const k in f) if (typeof f[k] === "string") { f[k] = f[k].trim(); if (f[k] === "") f[k] = null; }
      f.retail_price = Number(f.retail_price) || 0;
      f.show_online = !!e.target.querySelector("[name=show_online]").checked;
      if (!f.name) return toast("Give the item a name");
      try {
        if (p) await q(sb.from("products").update(f).eq("sku", p.sku));
        else {
          /* next ITM number counts hidden (deleted) items too, so a code is never reused */
          let all = state.products; try { all = await q(sb.from("products").select("sku")); } catch {}
          all = all.slice();
          const box = root.querySelector("#sizeRows");
          const items = picked.length ? picked.map(sh => {
            const pr = Number(box.querySelector(`[data-sp="${sh}"]`).value), n = parseInt(box.querySelector(`[data-sq="${sh}"]`).value, 10) || 0;
            return { row: { ...f, family: f.family || f.name, name: `${f.name} - ${sh}`, size: NEW_SIZES.find(x => x[0] === sh)[1], retail_price: isNaN(pr) ? f.retail_price : pr }, n };
          }) : [{ row: f, n: start }];
          if (items.some(it => !(it.row.retail_price >= 0))) return toast("Check the prices");
          for (const it of items) { it.row.sku = newKey(all); all.push({ sku: it.row.sku }); }
          await q(sb.from("products").insert(items.map(it => it.row)));
          const mv = items.filter(it => it.n > 0).map(it => ({ sku: it.row.sku, qty: it.n, to_location: workshop().id, reason: "restock", notes: "New item" }));
          if (mv.length) await q(sb.from("stock_movements").insert(mv));
          var addedMsg = items.length > 1 ? `${f.name} added in ${items.length} sizes` : (start ? `${f.name} added · ${start} in workshop` : `${f.name} added`);
        }
        await loadAll(); closeSheet(); toast(p ? "Item saved" : addedMsg); render();
      } catch (err) { fail(err); }
    };
  });
}

/* =========================================================
   ITEMS TABLE — edit many items at once (the single Edit item page still works)
   ========================================================= */
const XT_COLS = [
  { k: "name", label: "Name", w: 240, type: "text" },
  { k: "category", label: "Category", w: 120, type: "list" },
  { k: "collection", label: "Collection", w: 120, type: "list" },
  { k: "family", label: "Family", w: 140, type: "list" },
  { k: "size", label: "Size", w: 100, type: "list" },
  { k: "retail_price", label: "Price (RM)", w: 90, type: "money" },
  { k: "_stock", label: "Workshop stock", w: 90, type: "int" },
  { k: "status", label: "Status", w: 120, type: "select", opts: ["Active", "Paused", "Replaced", "Discontinued"] },
  { k: "show_online", label: "Online", w: 64, type: "check" },
  { k: "material", label: "Material", w: 110, type: "text" },
  { k: "dimensions", label: "Dimensions", w: 120, type: "text" },
  { k: "web_description", label: "Shop description", w: 240, type: "text" }
];
let xtState = { tab: "Active", cat: "", q: "", edits: {}, sel: new Set() };
function itemsTableSheet() {
  xtState.edits = {}; xtState.sel = new Set();
  const ws = workshop();
  const val = (p, k) => k === "_stock" ? stockAt(ws.id, p.sku) : p[k];
  const cur = (p, k) => (xtState.edits[p.sku] && k in xtState.edits[p.sku]) ? xtState.edits[p.sku][k] : val(p, k);
  const lists = {}; ["category", "collection", "family", "size"].forEach(k => lists[k] = [...new Set(state.products.map(x => x[k]).filter(Boolean))].sort());
  const cats = lists.category;
  openSheet(`
    <h2>Items table</h2>
    <div class="xt-page">
      <p class="small muted" style="margin:-4px 2px 10px">Tap a cell to change it. Changes are highlighted and only saved when you tap Save. Workshop stock changes are recorded as count corrections.</p>
      <div class="ttabs">${["Active", "Paused", "Replaced", "Discontinued", "All"].map(k => `<button type="button" data-xs="${k}" aria-pressed="${k === xtState.tab}">${k}</button>`).join("")}</div>
      <div class="xt-tools">
        <input class="search" id="xtQ" type="search" placeholder="Search items" value="${esc(xtState.q)}">
        <select id="xtCat"><option value="">All categories</option>${cats.map(c => `<option ${c === xtState.cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
      </div>
      <div class="xt-fill" id="xtFill" hidden>
        <b id="xtSelN"></b>
        <select id="xtField">${XT_COLS.filter(c => c.k !== "name").map(c => `<option value="${c.k}">${c.label}</option>`).join("")}</select>
        <span id="xtValBox"></span>
        <button type="button" class="btn" id="xtApply">Set for selected</button>
      </div>
      ${["category", "collection", "family", "size"].map(k => `<datalist id="xt-dl-${k}">${lists[k].map(x => `<option value="${esc(x)}">`).join("")}</datalist>`).join("")}
      <div class="xt-wrap" id="xtWrap"></div>
      <div class="xt-bar"><span id="xtCount" class="small muted">No changes</span><button type="button" class="btn" id="xtDiscard" disabled>Discard</button><button type="button" class="btn primary" id="xtSave" disabled>Save changes</button></div>
    </div>`, root => {
    const $r = s => root.querySelector(s);
    const visible = () => {
      const s = xtState.q.trim().toLowerCase();
      return state.products.filter(p => (xtState.tab === "All" || (p.status || "Active") === xtState.tab) && (!xtState.cat || p.category === xtState.cat)
        && (!s || [p.name, p.sku, p.family, p.collection, p.category].join(" ").toLowerCase().includes(s)))
        .sort((a, b) => (a.category || "").localeCompare(b.category || "") || (a.family || "").localeCompare(b.family || "") || a.name.localeCompare(b.name));
    };
    const cell = (p, c) => {
      const v = cur(p, c.k), dirty = xtState.edits[p.sku] && c.k in xtState.edits[p.sku];
      const a = `data-sku="${esc(p.sku)}" data-k="${c.k}" class="xt-in${dirty ? " dirty" : ""}"`;
      if (c.type === "check") return `<td class="c"><input type="checkbox" ${a} ${v ? "checked" : ""}></td>`;
      if (c.type === "select") return `<td><select ${a}>${c.opts.map(o => `<option ${o === (v || "Active") ? "selected" : ""}>${o}</option>`).join("")}</select></td>`;
      if (c.type === "money" || c.type === "int") return `<td><input ${a} type="number" inputmode="${c.type === "int" ? "numeric" : "decimal"}" step="${c.type === "int" ? 1 : 0.01}" value="${v ?? ""}"></td>`;
      if (c.k === "name" || c.k === "web_description") return `<td><textarea ${a} rows="2">${esc(v ?? "")}</textarea></td>`;   /* long text wraps */
      return `<td><input ${a} ${c.type === "list" ? `list="xt-dl-${c.k}"` : ""} value="${esc(v ?? "")}"></td>`;
    };
    const draw = () => {
      const rows = visible();
      $r("#xtWrap").innerHTML = rows.length ? `<table class="xt"><thead><tr><th class="xt-sel"><input type="checkbox" id="xtAll" aria-label="Select all"></th><th class="xt-ph"></th>${XT_COLS.map(c => `<th style="min-width:${c.w}px"${c.k === "name" ? ' class="xt-name"' : ""}>${c.label}</th>`).join("")}</tr></thead>
        <tbody>${rows.map(p => `<tr data-row="${esc(p.sku)}"><td class="xt-sel"><input type="checkbox" data-pick="${esc(p.sku)}" ${xtState.sel.has(p.sku) ? "checked" : ""}></td>
          <td class="xt-ph">${photo(p) ? `<img src="${esc(photo(p))}" alt="" loading="lazy">` : `<div class="ph ${catG(p.category)}"></div>`}</td>
          ${XT_COLS.map(c => c.k === "name" ? cell(p, c).replace("<td>", '<td class="xt-name">') : cell(p, c)).join("")}</tr>`).join("")}</tbody></table>`
        : `<div class="small muted" style="padding:14px 2px">No items here.</div>`;
      bind(); counts();
    };
    const counts = () => {
      const skus = Object.keys(xtState.edits), n = skus.reduce((t, s) => t + Object.keys(xtState.edits[s]).length, 0);
      const bad = root.querySelectorAll(".xt-in.bad").length;
      $r("#xtCount").textContent = n ? `${n} change${n > 1 ? "s" : ""} on ${skus.length} item${skus.length > 1 ? "s" : ""}${bad ? ` · ${bad} to fix` : ""}` : "No changes";
      $r("#xtSave").disabled = !n || !!bad; $r("#xtDiscard").disabled = !n;
      $r("#xtSave").textContent = n ? `Save changes (${n})` : "Save changes";
      $r("#xtFill").hidden = !xtState.sel.size; $r("#xtSelN").textContent = `${xtState.sel.size} selected`;
    };
    const setEdit = (sku, k, raw) => {
      const p = prod(sku), c = XT_COLS.find(x => x.k === k); let v = raw, ok = true;
      if (c.type === "money") { ok = raw !== "" && !isNaN(Number(raw)) && Number(raw) >= 0; v = ok ? Number(raw) : raw; }
      else if (c.type === "int") { ok = raw !== "" && Number.isInteger(Number(raw)); v = ok ? Number(raw) : raw; }
      else if (c.type === "check") v = !!raw;
      else { v = String(raw).trim(); if (v === "") v = null; if (k === "name" && !v) ok = false; }
      const orig = val(p, k), same = c.type === "check" ? !!orig === v : (orig ?? null) === (v ?? null) || (c.type === "money" && Number(orig) === v);
      xtState.edits[sku] = xtState.edits[sku] || {};
      if (same && ok) delete xtState.edits[sku][k]; else xtState.edits[sku][k] = v;
      if (!Object.keys(xtState.edits[sku]).length) delete xtState.edits[sku];
      root.querySelectorAll(`.xt-in[data-sku="${CSS.escape(sku)}"][data-k="${k}"]`).forEach(el => { el.classList.toggle("dirty", !same || !ok); el.classList.toggle("bad", !ok); });
      counts();
    };
    function bind() {
      root.querySelectorAll(".xt-in").forEach(el => {
        const ev = el.type === "checkbox" || el.tagName === "SELECT" ? "change" : "input";
        el.addEventListener(ev, () => setEdit(el.dataset.sku, el.dataset.k, el.type === "checkbox" ? el.checked : el.value));
      });
      root.querySelectorAll("[data-pick]").forEach(el => el.onchange = () => { el.checked ? xtState.sel.add(el.dataset.pick) : xtState.sel.delete(el.dataset.pick); counts(); });
      const all = $r("#xtAll"); if (all) all.onchange = () => { visible().forEach(p => all.checked ? xtState.sel.add(p.sku) : xtState.sel.delete(p.sku)); draw(); };
    }
    const valBox = () => {
      const c = XT_COLS.find(x => x.k === $r("#xtField").value);
      $r("#xtValBox").innerHTML = c.type === "check" ? `<select id="xtVal"><option value="1">Ticked</option><option value="">Not ticked</option></select>`
        : c.type === "select" ? `<select id="xtVal">${c.opts.map(o => `<option>${o}</option>`).join("")}</select>`
        : `<input id="xtVal" ${c.type === "money" || c.type === "int" ? 'type="number" inputmode="decimal"' : ""} ${c.type === "list" ? `list="xt-dl-${c.k}"` : ""} placeholder="New value">`;
    };
    $r("#xtField").onchange = valBox; valBox();
    $r("#xtApply").onclick = () => {
      const k = $r("#xtField").value, raw = $r("#xtVal").value, c = XT_COLS.find(x => x.k === k);
      [...xtState.sel].forEach(sku => setEdit(sku, k, c.type === "check" ? !!raw : raw));
      draw(); toast(`${XT_COLS.find(x => x.k === k).label} set for ${xtState.sel.size} item${xtState.sel.size > 1 ? "s" : ""}`);
    };
    root.querySelectorAll("[data-xs]").forEach(b => b.onclick = () => { xtState.tab = b.dataset.xs; root.querySelectorAll("[data-xs]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    $r("#xtCat").onchange = e => { xtState.cat = e.target.value; draw(); };
    $r("#xtQ").oninput = e => { xtState.q = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(draw, 150); };
    $r("#xtDiscard").onclick = () => { if (!confirm("Discard all unsaved changes?")) return; xtState.edits = {}; draw(); };
    $r("#xtSave").onclick = async () => {
      const btn = $r("#xtSave"); btn.disabled = true; btn.textContent = "Saving…";
      const jobs = [], moves = [];
      for (const [sku, ch] of Object.entries(xtState.edits)) {
        const { _stock, ...fields } = ch;
        if (Object.keys(fields).length) jobs.push(() => q(sb.from("products").update(fields).eq("sku", sku)));
        if (_stock !== undefined) {
          const have = stockAt(ws.id, sku), d = _stock - have;
          if (d) moves.push({ moved_on: ymd(new Date()), sku, qty: Math.abs(d), [d > 0 ? "to_location" : "from_location"]: ws.id, reason: "correction", notes: `Count fixed in items table (${have} → ${_stock})` });
        }
      }
      try {
        for (let i = 0; i < jobs.length; i += 6) await Promise.all(jobs.slice(i, i + 6).map(f => f()));
        if (moves.length) await q(sb.from("stock_movements").insert(moves));
        const n = Object.keys(xtState.edits).length;
        xtState.edits = {}; await loadAll(); toast(`${n} item${n > 1 ? "s" : ""} saved`); draw();
      } catch (e) { fail(e); counts(); }
    };
    draw();
  });
}

/* =========================================================
   ONLINE SHOP — orders placed on the shop website, and its settings
   ========================================================= */
const SHOP_STATUS = { pending: "Waiting for payment", paid: "Paid · to pack & ship", packed: "Packed", shipped: "Shipped · on the way", delivered: "Delivered", cancelled: "Cancelled" };
const SHOP_REGION = { semenanjung: "Peninsular Malaysia", sarawak: "Sarawak", sabah: "Sabah", overseas: "Overseas" };
const waNum = ph => String(ph || "").replace(/\D/g, "").replace(/^0/, "60");
let shopTab = "todo";
let shopCache = [], shopSkipRefresh = false, shopLive = null;
let chatOpen = null;   /* { id, draw } for the order page on screen, so live updates can refresh its messages */
const SHOP_URL = "https://apolakibyjason.vercel.app";
const fetchShopOrders = () => q(live("shop_orders", "*").order("created_at", { ascending: false }).limit(200));
/* ---------- phone notifications for new shop orders (Accounts → Notifications) ---------- */
const pushSupported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const b64Bytes = s => Uint8Array.from(atob((s + "===".slice((s.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function pushSub() { return (await navigator.serviceWorker.ready).pushManager.getSubscription(); }
async function pushCard() {
  const el = $("#pushCard"); if (!el) return;
  if (!pushSupported()) {
    el.innerHTML = `<div class="small muted">${/iPhone|iPad|iPod/.test(navigator.userAgent) ? "On iPhone, tap Share → Add to Home Screen, then open Apolaki from the Home Screen icon to turn on notifications." : "This browser can't show notifications."}</div>`;
    return;
  }
  const sub = await pushSub().catch(() => null);
  if (!$("#pushCard")) return;
  if (sub && Notification.permission === "granted") {
    el.innerHTML = `<div class="small muted" style="margin-bottom:10px">On for this phone. You'll get an alert for every new shop order.</div><div class="btns" style="margin:0"><button class="btn" id="pushTest" type="button" style="flex:1">Send a test</button><button class="btn danger" id="pushOff" type="button" style="flex:1">Turn off</button></div>`;
    $("#pushTest").onclick = pushTest; $("#pushOff").onclick = pushOff;
  } else if (Notification.permission === "denied") {
    el.innerHTML = `<div class="small muted">Notifications are blocked for Apolaki. Allow them in your phone's settings, then come back here.</div>`;
  } else {
    el.innerHTML = `<div class="small muted" style="margin-bottom:10px">Get an alert on this phone when someone orders from the shop.</div><button class="btn primary block" id="pushOn" type="button">Turn on notifications</button>`;
    $("#pushOn").onclick = pushOn;
  }
}
async function pushOn(e) {
  e.currentTarget.disabled = true;
  try {
    if (await Notification.requestPermission() !== "granted") return pushCard();
    const { data, error } = await sb.functions.invoke("notify-new-order", { body: { action: "key" } });
    if (error) throw error;
    const sub = await (await navigator.serviceWorker.ready).pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64Bytes(data.key) });
    const j = sub.toJSON();
    await q(sb.from("push_subscriptions").upsert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, email: state.user.email.toLowerCase(), device: navigator.userAgent.slice(0, 200) }));
    toast("Notifications are on");
  } catch (err) { fail(err); }
  pushCard();
}
async function pushOff(e) {
  e.currentTarget.disabled = true;
  try {
    const sub = await pushSub();
    if (sub) { await q(sb.from("push_subscriptions").delete().eq("endpoint", sub.endpoint)); await sub.unsubscribe(); }
    toast("Notifications are off for this phone");
  } catch (err) { fail(err); }
  pushCard();
}
async function pushTest(e) {
  const b = e.currentTarget; b.disabled = true;
  try {
    const { data, error } = await sb.functions.invoke("notify-new-order", { body: { action: "test" } });
    if (error) throw error;
    toast(data.sent ? "Test sent. It should arrive in a few seconds." : "Couldn't reach this phone. Turn notifications off and on again.");
  } catch (err) { fail(err); }
  b.disabled = false;
}
/* tapping a notification opens the shop orders, or the order a message is about */
function openFromNotification(open) {
  if (!state.user || !open) return;
  const m = /^order:(\d+)$/.exec(open);
  if (m) shopOrdersSheet().then(() => openShopOrder(Number(m[1])));
  else if (open === "orders") shopOrdersSheet();
}
if ("serviceWorker" in navigator) navigator.serviceWorker.addEventListener("message", e => { if (e.data) openFromNotification(e.data.open); });

async function shopOrdersSheet() {
  try { shopCache = await fetchShopOrders(); } catch (e) { return fail(e); }
  watchShop();
  shopSkipRefresh = true; openSheet(...shopListPage());
}
/* re-read the orders and redraw the list if it changed (on Back, when the app comes back to the front, or when an order changes) */
async function refreshShopList() {
  const entry = pageStack.find(x => x.title === "Shop orders"); if (!entry) return;
  let fresh; try { fresh = await fetchShopOrders(); } catch { return; }
  if (JSON.stringify(fresh) === JSON.stringify(shopCache)) return;
  shopCache = fresh;
  const [html, bind] = shopListPage(); entry.html = html; entry.bind = bind;
  if (pageStack[pageStack.length - 1] === entry && !$("#sheet").hidden) { shopSkipRefresh = true; showPage(entry); }
}
/* live updates: new orders and status changes show up without leaving the page */
function watchShop() {
  if (shopLive || !sb.channel) return;
  shopLive = sb.channel("shop-orders").on("postgres_changes", { event: "*", schema: "public", table: "shop_orders" }, payload => {
    const row = payload && payload.new;
    if (row && chatOpen && row.id === chatOpen.id && $("#chat")) {
      chatOpen.draw();
      if (row.customer_waiting) sb.from("shop_orders").update({ customer_waiting: false }).eq("id", row.id).then(() => {});   /* being read right now */
    }
    clearTimeout(watchShop.t);
    watchShop.t = setTimeout(() => { refreshShopList(); localSet("homeData", null); if (state.tab === "home" && $("#sheet").hidden) renderHome(); }, 400);
  }).subscribe();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshShopList(); });
function shopListPage() {
  const orders = shopCache;
  const tabs = [["todo", "To do", o => ["pending", "paid", "packed"].includes(o.status)], ["shipped", "Shipped", o => o.status === "shipped"], ["done", "Completed", o => o.status === "delivered"], ["cancelled", "Cancelled", o => o.status === "cancelled"]];
  return [`
    <h2>Shop orders</h2>
    <button class="btn block" id="shopSet">Shop settings</button>
    <div class="ttabs" style="margin-top:16px">${tabs.map(([k, l, f]) => `<button type="button" data-t="${k}" aria-pressed="${k === shopTab}">${l} <span class="muted">${orders.filter(f).length}</span></button>`).join("")}</div>
    <div class="list tight" id="ordList"></div>`, root => {
    const draw = () => {
      const f = tabs.find(t => t[0] === shopTab)[2], list = orders.filter(f);
      root.querySelector("#ordList").innerHTML = list.length ? list.map(o => `<div class="row" data-o="${o.id}"><div class="grow"><div class="title">${esc(o.order_no)} · ${esc(o.customer_name)}</div>
        <div class="small muted">${ago(o.created_at)} · ${esc(SHOP_REGION[o.region] || o.region)}</div><span class="tag" style="margin-top:4px">${esc(SHOP_STATUS[o.status] || o.status)}</span>${o.customer_waiting ? ` <span class="tag brass" style="margin-top:4px">New message</span>` : ""}</div>
        <span class="num">${o.total != null ? RM(o.total) : ""}</span>${CHEV}</div>`).join("") : `<div class="small muted" style="padding:12px 2px">No orders here.</div>`;
      root.querySelectorAll("[data-o]").forEach(r => r.onclick = () => openShopOrder(Number(r.dataset.o)));
    };
    root.querySelectorAll("[data-t]").forEach(b => b.onclick = () => { shopTab = b.dataset.t; root.querySelectorAll("[data-t]").forEach(x => x.setAttribute("aria-pressed", x === b)); draw(); });
    root.querySelector("#shopSet").onclick = shopSettingsSheet;
    draw();
    if (!shopSkipRefresh) refreshShopList();
    shopSkipRefresh = false;
  }];
}
/* always read the order fresh from the database, so it shows the latest status */
async function openShopOrder(id) {
  watchShop();
  try {
    const [rows, items] = await Promise.all([q(live("shop_orders", "*").eq("id", id)), q(sb.from("shop_order_items").select("*").eq("order_id", id).order("id"))]);
    if (!rows.length) return toast("Order not found");
    const i = shopCache.findIndex(x => x.id === id); if (i >= 0) shopCache[i] = rows[0];
    shopOrderPage(rows[0], items);
  } catch (e) { fail(e); }
}
/* messages and payment receipts for one order; customers write from their order page on the shop */
async function loadChat(orderId) {
  const msgs = await q(sb.from("shop_messages").select("*").eq("order_id", orderId).order("id"));
  const paths = msgs.filter(m => m.attachment_path).map(m => m.attachment_path);
  if (paths.length) {
    const { data } = await sb.storage.from("shop-receipts").createSignedUrls(paths, 3600);
    (data || []).forEach(d => { const m = msgs.find(x => x.attachment_path === d.path); if (m && d.signedUrl) m.url = d.signedUrl; });
  }
  return msgs;
}
function chatHtml(msgs) {
  if (!msgs.length) return `<div class="small muted">No messages yet. The customer can message you and upload a receipt from their order page on the shop.</div>`;
  return msgs.map(m => `<div class="bubble${m.sender === "team" ? " me" : ""}">
    ${m.kind !== "receipt" ? `<div class="txt">${esc(m.body)}</div>`
      : !m.url ? `<div class="txt">Payment receipt</div>`
      : /\.pdf$/i.test(m.attachment_path) ? `<a href="${esc(m.url)}" target="_blank" rel="noopener">Payment receipt (PDF) · Open</a>`
      : `<a href="${esc(m.url)}" target="_blank" rel="noopener"><img class="rcpt" src="${esc(m.url)}" alt="Payment receipt"></a><div class="txt">Payment receipt · tap to enlarge</div>`}
    <div class="small muted">${m.sender === "team" ? esc(m.sender_name || "Apolaki") + " · " : ""}${ago(m.created_at)}</div></div>`).join("");
}
async function shopOrderPage(o, items) {
  if (!items) try { items = await q(sb.from("shop_order_items").select("*").eq("order_id", o.id).order("id")); } catch (e) { return fail(e); }
  const made = items.filter(i => !i.ready);
  const addr = [o.address, [o.postcode, o.city].filter(Boolean).join(" "), o.state, o.region === "overseas" ? o.country : ""].filter(Boolean).join(", ");
  const msg = o.status === "delivered" ? `Hi ${o.customer_name}, hope you're enjoying your Apolaki piece! Thank you for your order ${o.order_no}.`
    : o.status === "shipped" ? `Hi ${o.customer_name}, your Apolaki order ${o.order_no} is on its way!${o.tracking ? ` Tracking: ${o.tracking}${o.courier ? " (" + o.courier + ")" : ""}` : ""}`
    : o.status === "pending" ? `Hi ${o.customer_name}, thank you for your Apolaki order ${o.order_no}.${o.shipping_fee == null ? "" : ` The total is ${RM(o.total)}.`}`
    : `Hi ${o.customer_name}, we've received your payment for Apolaki order ${o.order_no}. Thank you!`;
  const when = [["Ordered", o.created_at], ["Paid", o.paid_at], ["Packed", o.packed_at], ["Shipped", o.shipped_at], ["Delivered", o.delivered_at]].filter(x => x[1]).map(([l, t]) => `${l} ${ago(t)}`).join(" · ");
  const PAY = ["DuitNow", "Transfer", "Cash"];
  openSheet(`
    <h2>Order ${esc(o.order_no)}</h2>
    <p class="small muted" style="margin:-4px 2px 12px">${esc(SHOP_STATUS[o.status] || o.status)} · ${esc(when)}</p>
    <div class="card">
      <h3>${esc(o.customer_name)}</h3>
      <p class="small" style="margin:4px 0">${esc(o.phone)}${o.email ? " · " + esc(o.email) : ""}</p>
      <p class="small muted" style="margin:0">${esc(SHOP_REGION[o.region] || o.region)}${addr ? " · " + esc(addr) : ""}</p>
      ${o.customer_note ? `<p class="small" style="margin:8px 0 0"><b>Note:</b> ${esc(o.customer_note)}</p>` : ""}
      <a class="btn block" style="margin-top:12px" href="https://wa.me/${waNum(o.phone)}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">WhatsApp ${esc(o.customer_name.split(" ")[0])}</a>
    </div>
    <h3 style="margin-top:16px">Messages</h3>
    <div class="card"><div class="chat" id="chat"><div class="small muted">Loading…</div></div>
      <div class="composer"><textarea id="reply" rows="2" maxlength="1000" placeholder="Reply to ${esc(o.customer_name.split(" ")[0])}…"></textarea><button class="btn primary" id="sendReply" type="button">Send</button></div>
      <div class="small muted" style="margin-top:8px">${esc(o.customer_name.split(" ")[0])} sees your reply on their order page. <button type="button" class="linkish" id="copyPage">Copy their order page link</button></div></div>
    <div class="list tight" style="margin-top:12px">${items.map(i => `<div class="row"><div class="grow"><div class="title" style="white-space:normal">${i.qty}× ${esc(nice(i.name))}</div>
      <div class="small muted">${i.size && !/^(free|assorted)$/i.test(i.size) ? esc(i.size) + " · " : ""}Qty ${i.qty}</div></div><span class="num">${RM(i.qty * i.unit_price)}</span></div>`).join("")}
      <div class="row"><div class="grow"><div class="title">Shipping</div></div><span class="num">${o.shipping_fee == null ? "Not set" : RM(o.shipping_fee)}</span></div>
      <div class="row"><div class="grow"><div class="title">Total</div></div><span class="num"><b>${RM(Number(o.subtotal) + Number(o.shipping_fee || 0))}</b></span></div></div>
    ${o.status === "pending" ? `
      ${o.region === "overseas" || o.shipping_fee == null ? `<div class="two" style="margin-top:14px"><label class="field"><span>Shipping fee (RM)</span><input id="fee" type="number" step="0.01" min="0" inputmode="decimal" value="${o.shipping_fee ?? ""}"></label>
        <div style="display:flex;align-items:flex-end;margin-bottom:12px"><button class="btn block" id="saveFee">Save fee</button></div></div>` : ""}
      <h3 style="margin-top:16px">Payment received?</h3>
      <div class="chips">${PAY.map((p, i) => `<button type="button" class="chip" data-pay="${p}" aria-pressed="${i === 0}">${p}</button>`).join("")}</div>
      <button class="btn primary block" id="paid" ${o.shipping_fee == null ? "disabled" : ""}>Confirm payment · ${RM(Number(o.subtotal) + Number(o.shipping_fee || 0))}</button>
      <p class="small muted" style="margin-top:8px">${o.shipping_fee == null ? "Save the shipping fee first, then WhatsApp the customer the total. " : ""}Records the sale as an online order. Stock leaves the Workshop when you mark it shipped.</p>` : ""}
    ${["paid", "packed"].includes(o.status) ? `
      ${o.status === "paid" ? `<button class="btn primary block" id="packed" style="margin-top:12px">Mark packed</button>
        <p class="small muted" style="margin-top:8px">Pack the order first. Shipping opens after it's packed.</p>` : `
      <h3 style="margin-top:16px">Ship it</h3>
      <div class="two"><label class="field"><span>Courier</span><input id="courier" placeholder="Pos Laju, J&amp;T…" value="${esc(o.courier || "")}"></label>
        <label class="field"><span>Tracking number</span><input id="tracking" value="${esc(o.tracking || "")}"></label></div>
      <label class="field"><span>Actual postage paid (RM, optional)</span><input id="postage" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Customer paid ${o.shipping_fee != null ? RM(o.shipping_fee) : "–"}"></label>
      <button class="btn primary block" id="shipped">Mark shipped</button>
      <p class="small muted" style="margin-top:8px">Takes the pieces out of Workshop stock. Actual postage is saved as a Postage expense, so Accounts shows what's left of the shipping charge.</p>`}` : ""}
    ${["shipped", "delivered"].includes(o.status) && o.tracking ? `<p class="small" style="margin-top:12px">Tracking: <b>${esc(o.tracking)}</b>${o.courier ? " · " + esc(o.courier) : ""}</p>` : ""}
    ${["shipped", "delivered"].includes(o.status) && o.postage_cost != null ? `<p class="small muted" style="margin-top:4px">Postage paid ${RM(o.postage_cost)} · customer paid ${RM(o.shipping_fee || 0)} · kept ${RM(Number(o.shipping_fee || 0) - Number(o.postage_cost))}</p>` : ""}
    ${o.status === "shipped" ? `<button class="btn primary block" id="delivered" style="margin-top:14px">Mark delivered</button><p class="small muted" style="margin-top:8px">Moves the order to Completed.</p>` : ""}
    <label class="field" style="margin-top:16px"><span>Private note</span><input id="anote" value="${esc(o.admin_note || "")}" placeholder="Only you see this"></label>
    ${!["cancelled", "delivered"].includes(o.status) ? `<button type="button" class="btn danger block" id="cancel" style="margin-top:6px">Cancel order</button>` : ""}`, root => {
    const act = async (action, p, done) => {
      /* show it's working straight away */
      const btns = [...root.querySelectorAll("button")], clicked = document.activeElement, label = clicked && clicked.textContent;
      if (action !== "note") { btns.forEach(b => b.disabled = true); if (clicked && clicked.tagName === "BUTTON") clicked.textContent = "Saving…"; }
      try {
        const res = await q(sb.rpc("shop_order_action", { p_order: o.id, p_action: action, p: p || {} }));
        /* update the order list behind this page, so Back shows the new status */
        const i = shopCache.findIndex(x => x.id === res.id); if (i >= 0) shopCache[i] = res;
        const listEntry = pageStack.find(x => x.title === "Shop orders");
        if (listEntry) { const [html, bind] = shopListPage(); listEntry.html = html; listEntry.bind = bind; }
        toast(done); shopOrderPage(res, items);
        /* stock, home counts: refresh in the background */
        localSet("homeData", null);
        (["paid", "shipped", "cancel"].includes(action) ? loadStock() : Promise.resolve()).then(() => { if (state.tab === "home") renderHome(); }).catch(() => {});
      } catch (e) { btns.forEach(b => b.disabled = false); if (clicked && label) clicked.textContent = label; fail(e); }
    };
    const drawChat = async () => { try { const msgs = await loadChat(o.id); const el = root.querySelector("#chat"); if (el) el.innerHTML = chatHtml(msgs); } catch {} };
    chatOpen = { id: o.id, draw: drawChat };
    drawChat();
    if (o.customer_waiting) sb.from("shop_orders").update({ customer_waiting: false }).eq("id", o.id).then(() => { const i = shopCache.findIndex(x => x.id === o.id); if (i >= 0) shopCache[i].customer_waiting = false; });
    root.querySelector("#sendReply").onclick = async e => {
      const b = e.currentTarget, ta = root.querySelector("#reply"), text = ta.value.trim();
      if (!text) return;
      b.disabled = true; b.textContent = "Sending…";
      try {
        await q(sb.from("shop_messages").insert({ order_id: o.id, sender: "team", body: text, sender_name: state.name || null }));
        await q(sb.from("shop_orders").update({ customer_waiting: false, last_message_at: new Date().toISOString() }).eq("id", o.id));
        ta.value = ""; await drawChat();
      } catch (err) { fail(err); }
      b.disabled = false; b.textContent = "Send";
    };
    root.querySelector("#copyPage").onclick = async () => {
      const url = `${SHOP_URL}/#/o/${o.access_token}`;
      try { await navigator.clipboard.writeText(url); toast("Link copied. Paste it to the customer."); } catch { prompt("Order page link", url); }
    };
    let pay = PAY[0];
    root.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => { pay = b.dataset.pay; root.querySelectorAll("[data-pay]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    const $r = s => root.querySelector(s);
    if ($r("#saveFee")) $r("#saveFee").onclick = () => { const v = $r("#fee").value; if (v === "") return toast("Enter the shipping fee"); act("shipping", { fee: Number(v) }, "Shipping fee saved"); };
    if ($r("#paid")) $r("#paid").onclick = () => act("paid", { method: pay }, `${o.order_no} paid · sale recorded`);
    if ($r("#packed")) $r("#packed").onclick = () => act("packed", {}, "Marked packed");
    if ($r("#shipped")) $r("#shipped").onclick = () => act("shipped", { courier: $r("#courier").value, tracking: $r("#tracking").value, postage: $r("#postage").value }, `${o.order_no} shipped`);
    if ($r("#delivered")) $r("#delivered").onclick = () => act("delivered", {}, `${o.order_no} delivered · moved to Completed`);
    if ($r("#cancel")) $r("#cancel").onclick = () => { if (confirm(`Cancel order ${o.order_no}?${o.status !== "pending" ? " Its sale will be removed from your records." : ""}`)) act("cancel", {}, `${o.order_no} cancelled`); };
    $r("#anote").onchange = e => act("note", { note: e.target.value }, "Note saved");
  });
}
async function shopSettingsSheet() {
  let s = {};
  try { const r = await q(sb.from("app_settings").select("value").eq("key", "shop")); s = (r[0] || {}).value || {}; } catch (e) { return fail(e); }
  const rates = s.rates || {};
  const f = (k, label, v, extra = "") => `<label class="field"><span>${label}</span><input name="${k}" value="${esc(v ?? "")}" ${extra}></label>`;
  openSheet(`
    <h2>Shop settings</h2>
    <p class="small muted" style="margin:-4px 2px 12px">Everything here is shown to customers on the shop website.</p>
    ${s.shop_url ? `<a class="btn primary block" style="margin-bottom:14px" href="${esc(s.shop_url)}" target="_blank" rel="noopener">Open the shop</a>` : `<div class="warn-banner">Add the shop's web address at the bottom and save to get an <b>Open the shop</b> button here.</div>`}
    <form id="sf">
      ${f("whatsapp", "WhatsApp number for orders", s.whatsapp, 'type="tel" placeholder="012-345 6789"')}
      <div class="two">${f("bank_name", "Bank", s.bank_name, 'placeholder="Maybank"')}${f("account_name", "Account name", s.account_name)}</div>
      ${f("account_no", "Account number", s.account_no, 'inputmode="numeric"')}
      <label class="field"><span>DuitNow QR (optional)</span></label>
      <div class="photo-pick">
        <div class="photo-box" id="qrBox">${s.duitnow_qr ? `<img src="${esc(s.duitnow_qr)}" alt="">` : ""}</div>
        <div class="photo-btns"><label class="btn">Choose QR image<input type="file" accept="image/*" id="qrIn" hidden></label>
          ${s.duitnow_qr ? `<button type="button" class="link" id="noQr" style="color:var(--rust)">Remove</button>` : ""}</div>
      </div>
      <input type="hidden" name="duitnow_qr" id="qrVal" value="${esc(s.duitnow_qr || "")}">
      <h3 style="margin-top:16px">Standard shipping</h3>
      <div class="two">${f("r_semenanjung", "Peninsular (RM)", rates.semenanjung, 'type="number" step="0.01" min="0" inputmode="decimal"')}${f("r_sarawak", "Sarawak (RM)", rates.sarawak, 'type="number" step="0.01" min="0" inputmode="decimal"')}</div>
      <div class="two">${f("r_sabah", "Sabah (RM)", rates.sabah, 'type="number" step="0.01" min="0" inputmode="decimal"')}<div></div></div>
      <p class="small muted">Standard shipping charged at checkout. Overseas shipping is quoted per order on WhatsApp.</p>
      <h3 style="margin-top:16px">Website text</h3>
      ${f("banner_title", "Homepage headline", s.banner_title, 'placeholder="Shaped by hand, made for you."')}
      ${f("banner_text", "Homepage line under the headline", s.banner_text, 'placeholder="Bracelets, earrings and rings crafted in brass by Jason Labunda."')}
      <label class="field"><span>Returns &amp; exchanges policy (shown on product pages)</span><textarea name="returns_text" rows="4" style="min-height:96px;font-family:inherit;font-size:13.5px" placeholder="Write your policy here. Leave empty to hide it.">${esc(s.returns_text || "")}</textarea></label>
      ${f("shop_url", "Shop website address", s.shop_url, 'type="text" inputmode="url" autocapitalize="off" placeholder="apolaki-shop.vercel.app"')}
      <button class="btn primary block">Save settings</button>
    </form>`, root => {
    let busy = false;
    root.querySelector("#qrIn").onchange = async e => {
      const file = e.target.files && e.target.files[0]; if (!file) return;
      busy = true; root.querySelector("#qrBox").innerHTML = `<div class="skeleton" style="height:100%;margin:0"></div>`;
      try { const url = await uploadPhoto(file); root.querySelector("#qrVal").value = url; root.querySelector("#qrBox").innerHTML = `<img src="${esc(url)}" alt="">`; toast("QR added"); }
      catch (err) { root.querySelector("#qrBox").innerHTML = ""; fail(err); }
      busy = false; e.target.value = "";
    };
    const nq = root.querySelector("#noQr"); if (nq) nq.onclick = () => { root.querySelector("#qrVal").value = ""; root.querySelector("#qrBox").innerHTML = ""; nq.remove(); };
    root.querySelector("#sf").onsubmit = async e => {
      e.preventDefault();
      if (busy) return toast("Wait for the QR to finish uploading");
      const v = Object.fromEntries(new FormData(e.target)); for (const k in v) v[k] = String(v[k]).trim();
      const num = x => x === "" ? null : Number(x);
      const value = { ...s, whatsapp: v.whatsapp, bank_name: v.bank_name, account_name: v.account_name, account_no: v.account_no, duitnow_qr: v.duitnow_qr,
        banner_title: v.banner_title, banner_text: v.banner_text, returns_text: v.returns_text, shop_url: v.shop_url && !/^https?:\/\//i.test(v.shop_url) ? "https://" + v.shop_url : v.shop_url, rates: { semenanjung: num(v.r_semenanjung), sarawak: num(v.r_sarawak), sabah: num(v.r_sabah) } };
      if (Object.values(value.rates).some(r => r == null)) return toast("Fill in all three shipping rates");
      try { await q(sb.from("app_settings").upsert({ key: "shop", value, updated_at: new Date().toISOString() })); toast("Shop settings saved"); shopSettingsSheet(); }
      catch (err) { fail(err); }
    };
  });
}

/* =========================================================
   ACCOUNTS
   ========================================================= */
async function renderAccounts() {
  const view = $("#view");
  const mon = state.accMonth || ym(new Date()), ms = monthStart(mon), me = nextMonth(ms);
  const ys = new Date(ms.getFullYear(), 0, 1), ye = new Date(ms.getFullYear() + 1, 0, 1);
  const ck = "acc:" + ms.getFullYear(), cached = localGet(ck, null);
  if (cached) drawAccounts(...cached); else if (!view.querySelector("#mon")) view.innerHTML = `<h1 class="big">Money in<br>&amp; out</h1>${SKEL}`;
  let sales, pays, exps;
  try {
    [sales, pays, exps] = await Promise.all([
      q(live("sales", "id,sold_at,amount,channel,location_id,payment_method,sku,qty,description,notes").neq("channel", "retailer").gte("sold_at", ys.toISOString()).lt("sold_at", ye.toISOString())),
      q(sb.from("payouts").select("*").eq("paid", true).gte("paid_on", ymd(ys)).lt("paid_on", ymd(ye))),
      q(live("expenses", "*").gte("spent_on", ymd(ys)).lt("spent_on", ymd(ye)).order("spent_on", { ascending: false }))
    ]);
  } catch { if (!cached) view.innerHTML = `<h1 class="big">Money in<br>&amp; out</h1><div class="warn-banner">You're offline. Accounts need a connection.</div>`; return; }
  if (state.tab !== "accounts") return;
  try { const b = await fetchBalance(); if (JSON.stringify(b) !== JSON.stringify(state.balance)) { state.balance = b; localSet("balance", b); } } catch {}
  if (!cached || JSON.stringify([sales, pays, exps]) !== JSON.stringify(cached) || !$("#acctCard")) { localSet(ck, [sales, pays, exps]); drawAccounts(sales, pays, exps); }
}
function drawAccounts(sales, pays, exps) {
  const view = $("#view");
  const mon = state.accMonth || ym(new Date()), ms = monthStart(mon);

  const monthOf = d => ym(new Date(d.length === 10 ? d + "T00:00" : d));
  const months = Array.from({ length: 12 }, (_, i) => ym(new Date(ms.getFullYear(), i, 1)));
  const inc = Object.fromEntries(months.map(m => [m, 0])), out = Object.fromEntries(months.map(m => [m, 0]));
  sales.forEach(s => inc[monthOf(s.sold_at)] += Number(s.amount));
  pays.forEach(p => inc[monthOf(p.paid_on)] += Number(p.paid_amount ?? p.net_amount));
  exps.forEach(e => out[monthOf(e.spent_on)] += Number(e.amount));

  const mSales = sales.filter(s => monthOf(s.sold_at) === mon), mPays = pays.filter(p => monthOf(p.paid_on) === mon), mExps = exps.filter(e => monthOf(e.spent_on) === mon);
  const grouped = {};
  const mDays = {};
  mSales.filter(s => s.channel !== "other").forEach(s => {
    const day = ymd(new Date(s.sold_at)), k = (s.channel === "market" ? "M" : day) + "|" + s.location_id + "|" + s.channel;   /* a market's days count as one market */
    grouped[k] = (grouped[k] || 0) + Number(s.amount); if (s.channel === "market") (mDays[k] = mDays[k] || new Set()).add(day);
  });
  const incomeRows = [
    ...mPays.map(p => ({ d: p.paid_on, t: `${loc(p.location_id)?.name} payout`, s: `${monthLabel(p.period_month.slice(0, 7))} sales`, a: Number(p.paid_amount ?? p.net_amount) })),
    ...Object.entries(grouped).map(([k, a]) => { const [d, l, c] = k.split("|");
      if (c === "market") { const ds = [...mDays[k]].sort(), n = ds.length; return { d: ds[n - 1], t: loc(l)?.name || "Market", s: `Market · ${n > 1 ? `${n} days, ${shortDate(ds[0])}–` : ""}${n > 1 ? shortDate(ds[n - 1]) : "1 day"}`, a, d0: ds[0] }; }
      return { d, t: c === "online" ? "Online orders" : loc(l)?.name || "Market", s: c === "online" ? "Online" : "Market", a }; }),
    ...mSales.filter(s => s.channel === "other").map(s => ({ d: ymd(new Date(s.sold_at)), id: s.id, t: s.description || (s.sku ? prod(s.sku)?.name : "") || "Sale", s: ["Other sale", s.payment_method, s.sku && s.qty ? `${s.qty} × ${prod(s.sku)?.name || ""}` : null].filter(Boolean).join(" · "), a: Number(s.amount) }))
  ].sort((a, b) => b.d.localeCompare(a.d));

  const yearIn = months.reduce((t, m) => t + inc[m], 0), yearOut = months.reduce((t, m) => t + out[m], 0);
  const byCat = {}; exps.forEach(e => { const k = e.expense_group + "|" + e.category; byCat[k] = (byCat[k] || 0) + Number(e.amount); });

  const bal = state.balance || localGet("balance", null);
  /* balance brought in from last year, when the opening balance is set at the start of this year */
  const carry = bal && bal.date && +bal.date.slice(0, 4) === ms.getFullYear() && bal.date.slice(5, 7) === "01" ? Number(bal.opening) || 0 : 0;
  view.innerHTML = `<h1 class="big">Money in<br>&amp; out</h1>
    ${bal ? `<div id="acctCard">${balanceCard(bal)}<div class="opening-row"><span class="small muted">Opening balance ${RM(bal.opening)} on ${shortDate(bal.date)} ${bal.date.slice(0, 4)}</span><button class="btn" id="editOpening">Edit</button></div></div>` : ""}
    <label class="field"><span>Month</span><input id="mon" type="month" value="${mon}"></label>
    <div class="figures">
      <div class="figure lead"><div class="label">Left in ${monthStart(mon).toLocaleDateString("en-MY", { month: "long" })}</div><div class="value">${RM(inc[mon] - out[mon])}</div></div>
      <div class="figure"><div class="label">Money in</div><div class="value">${RM(inc[mon])}</div></div>
      <div class="figure"><div class="label">Spent</div><div class="value">${RM(out[mon])}</div></div></div>
    <div class="two-btn"><button class="btn primary" id="addInc">+ Add money in</button><button class="btn primary" id="addExp">+ Add an expense</button></div>
    <h2>Money in</h2>
    <div class="list tight">${incomeRows.map(r => `<div class="row"${r.id ? ` data-inc="${r.id}"` : ""}><div class="grow"><div class="title">${esc(r.t)}</div><div class="small muted">${r.d0 ? "" : shortDate(r.d) + " · "}${esc(r.s)}</div></div><span class="num">${RM(r.a)}</span></div>`).join("") || `<div class="empty">Nothing received this month yet.</div>`}</div>
    <h2>Spent</h2>
    <div class="list tight">${mExps.map(e => `<div class="row" data-exp="${e.id}"><div class="grow"><div class="title">${esc(e.description || e.category)}</div><div class="small muted">${shortDate(e.spent_on)} · ${esc(e.category)}${e.paid_to ? " · " + esc(e.paid_to) : ""}</div></div><span class="num">${RM(e.amount)}</span></div>`).join("") || `<div class="empty">No expenses this month.</div>`}</div>
    <h2>${ms.getFullYear()} by month</h2>
    <div class="card scroll-x"><table class="simple"><tr><th>Month</th><th class="r">In</th><th class="r">Spent</th><th class="r">Left</th></tr>
      ${carry ? `<tr><td>From ${ms.getFullYear() - 1}</td><td class="r muted">–</td><td class="r muted">–</td><td class="r" style="${carry < 0 ? "color:var(--rust)" : ""}">${RM(carry)}</td></tr>` : ""}
      ${months.filter(m => inc[m] || out[m]).map(m => `<tr><td>${monthStart(m).toLocaleDateString("en-MY", { month: "short" })}</td><td class="r">${RM(inc[m])}</td><td class="r">${RM(out[m])}</td><td class="r" style="${inc[m] - out[m] < 0 ? "color:var(--rust)" : ""}">${RM(inc[m] - out[m])}</td></tr>`).join("")}
      <tr><td><strong>Year</strong></td><td class="r"><strong>${RM(yearIn)}</strong></td><td class="r"><strong>${RM(yearOut)}</strong></td><td class="r"><strong style="${yearIn - yearOut + carry < 0 ? "color:var(--rust)" : ""}">${RM(yearIn - yearOut + carry)}</strong></td></tr></table></div>
    <h2>${ms.getFullYear()} profit and loss</h2>
    <div class="card scroll-x"><table class="simple">
      <tr><td>Product sales received</td><td class="r">${RM(yearIn)}</td></tr>
      ${GROUPS.concat(Object.keys(byCat).map(k => k.split("|")[0]).filter(g => !GROUPS.includes(g))).filter((g, i, a) => a.indexOf(g) === i).map(g => {
        const cats = Object.entries(byCat).filter(([k]) => k.split("|")[0] === g); if (!cats.length) return "";
        const sum = cats.reduce((t, [, v]) => t + v, 0);
        return `<tr><th colspan="2" style="padding-top:14px">${esc(g)}</th></tr>${cats.sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k.split("|")[1])}</td><td class="r">${RM(v)}</td></tr>`).join("")}<tr><td class="muted">Total ${esc(g.toLowerCase())}</td><td class="r muted">${RM(sum)}</td></tr>`;
      }).join("")}
      <tr><td><strong>Net income</strong></td><td class="r"><strong style="${yearIn - yearOut < 0 ? "color:var(--rust)" : ""}">${RM(yearIn - yearOut)}</strong></td></tr></table></div>`;
  view.insertAdjacentHTML("beforeend", `<h2>Notifications</h2><div class="card" id="pushCard"><div class="small muted">Checking this phone…</div></div>`);
  pushCard();
  view.insertAdjacentHTML("beforeend", `<h2>Account</h2><div class="card"><div class="small muted" style="margin-bottom:10px">Signed in as ${esc(state.user?.email || "")}</div><button class="btn danger block" id="signOut">Sign out</button></div>`);
  $("#signOut").onclick = () => sb.auth.signOut();
  $("#mon").onchange = e => { state.accMonth = e.target.value; render(); };
  $("#addExp").onclick = () => expenseForm(null);
  $("#addInc").onclick = () => incomeForm(null);
  const eo = $("#editOpening"); if (eo) eo.onclick = () => openingForm(bal);
  view.querySelectorAll("[data-inc]").forEach(r => r.onclick = () => incomeForm(sales.find(x => x.id === Number(r.dataset.inc))));
  view.querySelectorAll("[data-exp]").forEach(r => r.onclick = () => expenseForm(mExps.find(e => e.id === Number(r.dataset.exp))));
}

function openingForm(b) {
  openSheet(`
    <h2>Opening balance</h2>
    <p class="small muted">What the Apolaki bank account had on the start date. The account balance = this + money in − expenses from that date.</p>
    <form id="f">
      <label class="field"><span>Start date</span><input name="date" type="date" value="${b.date}" required></label>
      <label class="field"><span>Balance on that date (RM, use minus if it was below zero)</span><input name="amount" type="number" step="0.01" inputmode="decimal" value="${b.opening}" required></label>
      <button class="btn primary block">Save</button>
    </form>`, root => root.querySelector("#f").onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
      try {
        await q(sb.from("app_settings").upsert({ key: "opening_balance", value: { amount: round2(Number(f.amount)), date: f.date }, updated_at: new Date().toISOString() }, { onConflict: "key" }));
        state.balance = null; localSet("balance", null); closeSheet(); toast("Opening balance saved"); render();
      } catch (err) { fail(err); }
    });
}

/* money in from a sale entered by hand: not from a market, an online order or a shop report */
function incomeForm(x) {
  const v = x || { sold_at: new Date().toISOString(), payment_method: "Cash" };
  const items = activeProducts().concat(x && x.sku && !activeProducts().some(p => p.sku === x.sku) ? [prod(x.sku)].filter(Boolean) : []).sort((a, b) => a.name.localeCompare(b.name));
  const places = state.locations.filter(l => l.active || l.id === v.location_id);
  openSheet(`
    <h2>${x ? "Edit money in" : "Add money in"}</h2>
    <form id="f">
      <label class="field"><span>Date</span><input name="date" type="date" value="${ymd(new Date(v.sold_at))}" required></label>
      <label class="field"><span>Amount received (RM)</span><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${v.amount ?? ""}" required></label>
      <label class="field"><span>What was it</span><input name="description" value="${esc(v.description || "")}" placeholder="e.g. Custom ring for a friend"></label>
      <label class="field"><span>Paid by</span><select name="payment_method">${PAYMENTS.map(p => `<option ${v.payment_method === p ? "selected" : ""}>${p}</option>`).join("")}</select></label>
      <label class="field"><span>Item sold (optional, takes it off stock)</span><select name="sku" id="sku"><option value="">No item, money only</option>${items.map(p => `<option value="${p.sku}" ${v.sku === p.sku ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label>
      <div id="itemBits" ${v.sku ? "" : "hidden"}>
        <label class="field"><span>How many pieces</span><input name="qty" type="number" min="1" step="1" inputmode="numeric" value="${v.qty || 1}"></label>
        <label class="field"><span>Taken from</span><select name="location_id">${places.map(l => `<option value="${l.id}" ${(v.location_id ?? workshop()?.id) === l.id ? "selected" : ""}>${esc(l.name)} · ${v.sku ? stockAt(l.id, v.sku) : ""}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Note (optional)</span><input name="notes" value="${esc(v.notes || "")}" placeholder="e.g. Paid half, rest next week"></label>
      <button class="btn primary block">${x ? "Save changes" : "Add money in"}</button>
      ${x ? `<button class="btn danger block" type="button" id="del" style="margin-top:10px">Delete this entry</button>` : ""}
    </form>`, root => {
    const sel = root.querySelector("#sku"), bits = root.querySelector("#itemBits"), from = root.querySelector('[name="location_id"]');
    const refresh = () => {
      bits.hidden = !sel.value;
      [...from.options].forEach(o => o.textContent = `${loc(o.value)?.name}${sel.value ? ` · ${stockAt(Number(o.value), sel.value)} in stock` : ""}`);
      const amt = root.querySelector('[name="amount"]'), q = Number(root.querySelector('[name="qty"]').value) || 1;
      /* suggest the price × pieces, but never overwrite an amount you typed yourself */
      if (sel.value && (!amt.value || amt.dataset.auto === "1")) { amt.value = (q * Number(prod(sel.value)?.retail_price || 0)).toFixed(2); amt.dataset.auto = "1"; }
    };
    root.querySelector('[name="amount"]').oninput = e => { e.target.dataset.auto = ""; };
    sel.onchange = refresh; root.querySelector('[name="qty"]').oninput = refresh;
    refresh();
    root.querySelector("#f").onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const amount = round2(Number(f.amount));
      if (!(amount > 0)) return toast("Enter the amount received");
      const sku = f.sku || null, qty = sku ? Math.max(1, parseInt(f.qty, 10) || 1) : null;
      const row = { channel: "other", sold_at: new Date(f.date + "T12:00").toISOString(), sale_month: f.date.slice(0, 7) + "-01", amount,
        description: f.description.trim() || null, payment_method: f.payment_method, notes: f.notes.trim() || null,
        sku, qty, unit_price: sku ? Number(prod(sku)?.retail_price || 0) : null, location_id: sku ? Number(f.location_id) : null };
      try {
        if (x) await q(sb.from("sales").update(row).eq("id", x.id));
        else await q(sb.from("sales").insert({ ...row, client_id: uuid() }));
        if (sku || x?.sku) await loadStock();
        closeSheet(); toast(x ? "Saved" : `Money in added · ${RM(amount)}`); render();
      } catch (err) { fail(err); }
    };
    const d = root.querySelector("#del"); if (d) d.onclick = async () => {
      if (!confirm("Delete this money-in entry?" + (x.sku ? " The pieces go back into stock." : ""))) return;
      try { await q(sb.from("sales").update({ deleted_at: new Date().toISOString() }).eq("id", x.id)); if (x.sku) await loadStock(); closeSheet(); toast("Entry deleted"); render(); } catch (err) { fail(err); }
    };
  });
}

function expenseForm(x) {
  const v = x || { spent_on: ymd(new Date()), expense_group: "Cost of Goods Sold", category: "Raw Material" };
  const cats = CATEGORIES.includes(v.category) ? CATEGORIES : CATEGORIES.concat(v.category);
  const groups = GROUPS.includes(v.expense_group) ? GROUPS : GROUPS.concat(v.expense_group);
  openSheet(`
    <h2 style="margin-top:0">${x ? "Edit expense" : "Add an expense"}</h2>
    <form id="f">
      <div class="two"><label class="field"><span>Date</span><input name="spent_on" type="date" value="${v.spent_on}" required></label>
      <label class="field"><span>Amount (RM)</span><input name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${v.amount ?? ""}" required></label></div>
      <div class="two"><label class="field"><span>Type</span><select name="expense_group">${groups.map(g => `<option ${g === v.expense_group ? "selected" : ""}>${esc(g)}</option>`).join("")}</select></label>
      <label class="field"><span>Category</span><select name="category">${cats.map(c => `<option ${c === v.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label></div>
      <label class="field"><span>What was it</span><input name="description" value="${esc(v.description || "")}" placeholder="Brass wire"></label>
      <label class="field"><span>Paid to</span><input name="paid_to" value="${esc(v.paid_to || "")}" placeholder="Shopee"></label>
      <button class="btn primary block">${x ? "Save changes" : "Add expense"}</button>
      ${x ? `<button class="btn danger block" type="button" id="del" style="margin-top:8px">Delete expense</button>` : ""}
    </form>`, root => {
    root.querySelector("#f").onsubmit = async e => {
      e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); f.amount = Number(f.amount);
      try { if (x) await q(sb.from("expenses").update(f).eq("id", x.id)); else await q(sb.from("expenses").insert(f)); closeSheet(); toast(x ? "Expense updated" : "Expense added"); render(); } catch (err) { fail(err); }
    };
    const d = root.querySelector("#del"); if (d) d.onclick = async () => {
      if (!confirm("Delete this expense?")) return;
      try { await q(sb.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", x.id)); closeSheet(); toast("Expense deleted"); render(); } catch (err) { fail(err); }
    };
  });
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
