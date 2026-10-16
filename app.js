/* Apolaki — stock, sales and accounts for Apolaki by Jason Labunda.
   Plain JavaScript, no build step. Data lives in Supabase. */
(() => {
const cfg = window.APOLAKI_CONFIG || {};
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

const state = {
  user: null, tab: "home",
  products: [], locations: [], stock: [],
  sellAt: localGet("sellAt", null), cart: {}, payment: "Cash", discount: 0,
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
const RM = n => "RM" + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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

function toast(msg) { const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 2600); }
let sheetTimer;
function openSheet(html, bind) {
  clearTimeout(sheetTimer);
  const sh = $("#sheet");
  $("#sheetBody").innerHTML = html;
  if (sh.hidden) { sh.hidden = false; sh.getBoundingClientRect(); }
  sh.classList.add("open"); $("#sheetBody").parentElement.scrollTop = 0;
  document.body.classList.add("locked");
  if (bind) bind($("#sheetBody"));
  /* no auto-focus: on a phone it pops the keyboard and shifts the page */
}
function closeSheet() {
  const sh = $("#sheet"); sh.classList.remove("open"); document.body.classList.remove("locked");
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { sh.hidden = true; $("#sheetBody").innerHTML = ""; }, 320);
}
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

const prod = sku => state.products.find(p => p.sku === sku);
const loc = id => state.locations.find(l => l.id === Number(id));
const workshop = () => state.locations.find(l => l.type === "workshop");
const retailers = () => state.locations.filter(l => l.type === "retailer");
const activeProducts = () => state.products.filter(p => p.status === "Active");
/* retailer codes: each shop's own item code (Art Attic = APO numbers). Only shown on retailer pages. */
const codeAt = (locId, sku) => state.codes.find(c => c.location_id === Number(locId) && c.sku === sku)?.code || null;
const skuForCode = (locId, code) => state.codes.find(c => c.location_id === Number(locId) && c.code && c.code.toUpperCase() === String(code).toUpperCase())?.sku || null;
/* shop price: the retailer's own price for an item, falling back to the original price */
const shopPrice = (locId, sku) => { const c = state.codes.find(x => x.location_id === Number(locId) && x.sku === sku); return c && c.price != null ? Number(c.price) : Number(prod(sku)?.retail_price || 0); };
const CAT_ORDER = ["Bracelet", "Earrings", "Ring", "Neck Piece"];
const CAT_G = { Bracelet: "g-sky", Earrings: "g-sunset", Ring: "g-coral", "Neck Piece": "g-sea" };
const catG = c => CAT_G[c] || ["g-mint", "g-dusk", "g-sea"][String(c || "").length % 3];
const catIco = c => `<span class="cat-ico ${catG(c)}"><span>${esc(String(c || "?")[0])}</span></span>`;
function groupByCategory(ps) {
  const g = {}; ps.forEach(p => (g[p.category || "Other"] = g[p.category || "Other"] || []).push(p));
  return Object.entries(g).sort((a, b) => ((CAT_ORDER.indexOf(a[0]) + 1) || 99) - ((CAT_ORDER.indexOf(b[0]) + 1) || 99) || a[0].localeCompare(b[0]))
    .map(([k, v]) => [k, v.sort((x, y) => x.name.localeCompare(y.name))]);
}
const itemSub = p => [p.category, p.size && p.size !== "Free" ? p.size : null].filter(Boolean).join(" · ");
const initials = name => String(name || "?").replace(/\(.*?\)/g, "").split(/\s+/).filter(w => /[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0].toUpperCase()).join("");
const newKey = () => "ITM" + String(Math.max(0, ...state.products.filter(x => /^ITM\d+$/.test(x.sku)).map(x => parseInt(x.sku.slice(3), 10))) + 1).padStart(4, "0");
const photo = p => p && p.photo ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(p.photo)}&sz=w300` : null;

/* stock = server levels minus sales still waiting in the outbox */
function stockAt(locId, sku) {
  let q = 0;
  for (const s of state.stock) if (s.sku === sku && (locId === "all" || s.location_id === Number(locId))) q += s.qty;
  for (const r of outbox()) if (r.sku === sku && (locId === "all" || r.location_id === Number(locId))) q -= r.qty;
  return q;
}
const stockTotalAt = locId => state.products.reduce((t, p) => t + Math.max(0, stockAt(locId, p.sku)), 0);

async function q(promise) { const { data, error } = await promise; if (error) throw error; return data; }
function fail(e) { console.error(e); toast(e.message ? "Couldn't save: " + e.message : "Something went wrong. Check your connection."); }

/* ---------- offline outbox for sales ---------- */
const outbox = () => localGet("outbox", []);
function setOutbox(v) { localSet("outbox", v); updateBadge(); }
function updateBadge() {
  const b = $("#syncBadge"), n = outbox().length;
  if (!state.user) { b.hidden = true; return; }
  b.hidden = false;
  b.classList.toggle("pending", n > 0);
  b.textContent = n ? `${n} sale line${n > 1 ? "s" : ""} on phone` : (navigator.onLine ? "Synced" : "Offline");
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
    if (state.tab === "market") render();
  } catch (e) { console.warn("sync later", e); }
  syncing = false; updateBadge();
}
$("#syncBadge").addEventListener("click", sync);
window.addEventListener("online", sync);
window.addEventListener("offline", updateBadge);
setInterval(sync, 20000);

/* ---------- data ---------- */
async function loadAll() {
  try {
    const [p, l, c] = await Promise.all([
      q(sb.from("products").select("*").order("name")),
      q(sb.from("locations").select("*").order("id")),
      q(sb.from("retailer_codes").select("location_id,sku,code,price"))
    ]);
    state.products = p; state.locations = l; state.codes = c;
    localSet("products", p); localSet("locations", l); localSet("codes", c);
    await loadStock();
  } catch (e) {
    state.products = localGet("products", []); state.locations = localGet("locations", []); state.stock = localGet("stock", []); state.codes = localGet("codes", []);
    toast("Offline. Showing the last saved copy.");
  }
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
    <div class="mark"><svg viewBox="0 0 64 56" aria-hidden="true"><path d="M32 4 L60 52 H4 Z" fill="none" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/><path d="M21 40 L32 24 L43 40" fill="none" stroke="currentColor" stroke-width="5" stroke-linejoin="round" stroke-linecap="round"/></svg></div>
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
  if (!state.user) { updateBadge(); $("#avatar").hidden = true; return renderLogin(); }
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
  const av = $("#avatar"); av.hidden = false; av.textContent = (state.user.email || "?").slice(0, 2).toUpperCase();
  av.onclick = () => openSheet(`<h2 style="margin-top:0">Account</h2><p class="muted">${esc(state.user.email)}</p><button class="btn danger block" id="so">Sign out</button>`, r => r.querySelector("#so").onclick = () => { closeSheet(); sb.auth.signOut(); });
  await loadAll(); updateBadge(); sync(); render();
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
async function fetchHomeData() {
  const now = new Date(), ys = new Date(now.getFullYear(), 0, 1), ye = new Date(now.getFullYear() + 1, 0, 1);
  const pm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const [sales, pays, exps, unpaid, recentSales, recentMoves, lastReports] = await Promise.all([
    q(sb.from("sales").select("sold_at,amount,channel").neq("channel", "retailer").gte("sold_at", ys.toISOString()).lt("sold_at", ye.toISOString())),
    q(sb.from("payouts").select("paid_on,paid_amount,net_amount").eq("paid", true).gte("paid_on", ymd(ys)).lt("paid_on", ymd(ye))),
    q(sb.from("expenses").select("spent_on,amount,description,category").gte("spent_on", ymd(ys)).lt("spent_on", ymd(ye))),
    q(sb.from("payouts").select("*").eq("paid", false).order("period_month")),
    q(sb.from("sales").select("sold_at,amount,qty,sku,channel,location_id,cart_id,report_id").order("sold_at", { ascending: false }).limit(60)),
    q(sb.from("stock_movements").select("moved_on,qty,sku,from_location,to_location,reason,ref,created_at").order("moved_on", { ascending: false }).order("created_at", { ascending: false }).limit(30)),
    q(sb.from("payouts").select("location_id").eq("period_month", ymd(pm)))
  ]);
  return { year: now.getFullYear(), sales, pays, exps, unpaid, recentSales, recentMoves, lastReports };
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
    const k = "c" + (s.cart_id || s.sold_at);
    (carts[k] = carts[k] || { at: s.sold_at, kind: "sale", loc: s.location_id, ch: s.channel, qty: 0, amt: 0, items: [] });
    carts[k].qty += s.qty || 0; carts[k].amt += Number(s.amount); if (s.sku) carts[k].items.push(prod(s.sku)?.name || s.sku);
  }
  for (const c of Object.values(carts)) {
    if (c.kind === "report") ev.push({ at: c.at, chip: "Shop report", title: `${loc(c.loc)?.name || "Retailer"} · ${c.qty} pieces sold`, right: RM(c.amt) });
    else { const where = c.ch === "online" ? "Online order" : loc(c.loc)?.name || "Market";
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
  const src = { Shops: 0, Markets: 0, Online: 0 };
  d.sales.forEach(s => { inc[monthOf(s.sold_at)] += Number(s.amount); if (inPeriod(s.sold_at)) src[s.channel === "online" ? "Online" : "Markets"] += Number(s.amount); });
  d.pays.forEach(p => { const a = Number(p.paid_amount ?? p.net_amount); inc[monthOf(p.paid_on)] += a; if (inPeriod(p.paid_on)) src.Shops += a; });
  outbox().forEach(r => { src[r.channel === "online" ? "Online" : "Markets"] += Number(r.amount); inc[curM] += Number(r.amount); });
  const moneyIn = Object.values(src).reduce((a, b) => a + b, 0);
  const spent = d.exps.filter(e => inPeriod(e.spent_on)).reduce((t, e) => t + Number(e.amount), 0);
  const due = d.unpaid.reduce((t, r) => t + Number(r.net_amount), 0);
  const shown = months.filter(m => m <= curM).slice(-8);
  const max = Math.max(1, ...shown.map(m => inc[m]));
  const pieces = stockTotalAt("all");
  const label = period === "year" ? String(d.year) : now.toLocaleDateString("en-MY", { month: "long" });

  const srcColors = { Shops: "var(--mauve)", Markets: "var(--peach)", Online: "var(--sage)" };
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
  const low = activeProducts().map(p => ({ p, n: stockAt("all", p.sku) })).filter(x => x.n <= 1).sort((a, b) => a.n - b.n);
  const out = low.filter(x => x.n <= 0);
  const activeMarkets = state.locations.filter(l => l.type === "market" && l.active);

  /* needs attention: things that want an action */
  const attn = [];
  d.unpaid.filter(u => u.period_month.slice(0, 7) < curM).forEach(u => attn.push({ c: "var(--coral)", t: `${loc(u.location_id)?.name || "Shop"} hasn't paid ${monthLabel(u.period_month.slice(0, 7))}`, s: RM(u.net_amount) + " due", go: "retailers" }));
  const prevM = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  retailers().forEach(r => { const has = (d.lastReports || []).some(p => p.location_id === r.id); if (!has && now.getDate() >= 5) attn.push({ c: "var(--peach)", t: `No ${monthStart(prevM).toLocaleDateString("en-MY", { month: "long" })} sales report from ${r.name} yet`, s: "Paste it in Retailers", go: "retailers" }); });
  activeMarkets.filter(m => m.end_date && m.end_date < ymd(now)).forEach(m => attn.push({ c: "var(--peach)", t: `${m.name} ended ${shortDate(m.end_date)}`, s: "End the market to bring stock back", go: "market", sell: m.id }));
  if (out.length) attn.push({ c: "var(--coral)", t: `${out.length} piece${out.length > 1 ? "s" : ""} sold out`, s: out.slice(0, 3).map(x => x.p.name).join(", "), go: "stock" });
  if (outbox().length) attn.push({ c: "var(--mauve)", t: `${outbox().length} sale line${outbox().length > 1 ? "s" : ""} waiting to sync`, s: "Will send when you're online", go: "market" });

  const acts = recentActivity(d);
  const pc = (cls, title, val, go, sub, sun) => `<button class="pcard ${cls}" data-go="${go}">${sun ? '<span class="sun"></span>' : ""}<div class="pc-title">${esc(title)}</div><div><span class="pc-pill">${val}</span>${sub ? `<div class="pc-sub">${esc(sub)}</div>` : ""}</div></button>`;

  view.innerHTML = `
    <p class="hello">${greeting()}</p>
    <h1 class="big">How's Apolaki<br>doing today?</h1>
    <div class="ttabs"><button data-p="month" aria-pressed="${period === "month"}">This month</button><button data-p="year" aria-pressed="${period === "year"}">This year</button></div>
    <div class="masonry"><div class="mcol">
      ${pc("g-sky tall", "Money in", RM(moneyIn), "accounts", `${esc(label)} · spent ${RM(spent)}`, true)}
      ${pc("g-sea", "Pieces in stock", pieces, "stock", `${places.length} places`)}
      ${pc("g-mint", moneyIn - spent >= 0 ? "Left" : "Short", RM(Math.abs(moneyIn - spent)), "accounts", "Money in minus spent")}
    </div><div class="mcol">
      ${pc("g-sunset", "Payouts due", RM(due), "retailers", d.unpaid.length ? d.unpaid.map(u => monthStart(u.period_month.slice(0, 7)).toLocaleDateString("en-MY", { month: "short" })).join(", ") : "All paid")}
      ${pc("g-coral tall", "Running low", low.length, "stock", low.length ? low.slice(0, 2).map(x => x.p.name.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())).join(", ") + (low.length > 2 ? "…" : "") : "All stocked", true)}
      ${pc("g-dusk", activeMarkets.length === 1 ? "Market open" : "Markets open", activeMarkets.length, "market", activeMarkets.length ? activeMarkets.map(m => m.name).join(", ") : "Tap to start one")}
    </div></div>
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
  view.querySelectorAll("[data-go]").forEach(r => r.onclick = () => go(r.dataset.go));
  view.querySelectorAll("[data-ai]").forEach(r => r.onclick = () => { const a = attn[Number(r.dataset.ai)]; if (a.sell) { state.sellAt = a.sell; localSet("sellAt", a.sell); } go(a.go); });
  view.querySelectorAll("[data-place]").forEach(t => t.onclick = () => { state.stockLoc = Number(t.dataset.place); go("stock"); });
}

/* =========================================================
   SELL — market cashier and online orders
   ========================================================= */
function sellTarget() {
  const markets = state.locations.filter(l => l.type === "market" && l.active);
  const v = state.sellAt;
  if (v === "online") return { key: "online", name: "Online orders", stockLoc: workshop()?.id, channel: "online", locationId: workshop()?.id };
  const m = markets.find(l => l.id === Number(v)) || markets[0];
  if (!m) return null;
  return { key: m.id, name: m.name, stockLoc: m.id, channel: "market", locationId: m.id, market: m };
}
function cartLines() { return Object.entries(state.cart).filter(([, n]) => n > 0).map(([sku, n]) => ({ p: prod(sku), qty: n })); }
function cartGross() { return cartLines().reduce((t, l) => t + l.qty * Number(l.p.retail_price), 0); }

async function renderSell() {
  const view = $("#view");
  const markets = state.locations.filter(l => l.type === "market" && l.active);
  const t = sellTarget();
  const choices = markets.map(m => `<option value="${m.id}" ${t && t.key === m.id ? "selected" : ""}>${esc(m.name)}</option>`).join("")
    + `<option value="online" ${t && t.key === "online" ? "selected" : ""}>Online orders (from workshop)</option>`;
  if (!t) {
    view.innerHTML = `<h1 class="big">Sell at<br>the market</h1><div class="card"><h3>Start a market</h3><p class="muted">Create the market, bring stock from the workshop, then tap pieces to sell.</p><div class="btns"><button class="btn primary" id="newMarket">New market</button><button class="btn" id="goOnline">Record an online order</button></div></div>`;
    $("#newMarket").onclick = newMarketSheet;
    $("#goOnline").onclick = () => { state.sellAt = "online"; localSet("sellAt", "online"); render(); };
    return;
  }
  const s = state.search.toLowerCase();
  const items = activeProducts().filter(p => !s || p.name.toLowerCase().includes(s) || (p.family || "").toLowerCase().includes(s))
    .map(p => ({ p, left: stockAt(t.stockLoc, p.sku) })).sort((a, b) => (b.left > 0) - (a.left > 0) || a.p.name.localeCompare(b.p.name));
  const n = cartLines().reduce((x, l) => x + l.qty, 0);
  document.body.classList.toggle("has-cart", n > 0);
  view.innerHTML = `<h1 class="big">Sell at<br>the market</h1>
    <label class="field"><span>Selling at</span><select id="sellAt">${choices}</select></label>
    <div class="btns">
      ${t.market ? `<button class="btn" id="bring">Bring stock</button>` : ""}
      <button class="btn" id="today">Today's sales</button>
      <button class="btn" id="newMarket">New market</button>
      ${t.market ? `<button class="btn danger" id="endMarket">End market</button>` : ""}
    </div>
    <input class="search" id="search" type="search" placeholder="Search pieces" value="${esc(state.search)}">
    <div class="grid" id="grid">${items.map(({ p, left }) => {
      const inCart = state.cart[p.sku] || 0, img = photo(p);
      return `<button class="tile ${left - inCart <= 0 && !inCart ? "out" : ""} ${inCart ? "in-cart" : ""}" data-sku="${p.sku}" type="button">
        ${img ? `<img src="${img}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph ${catG(p.category)}',textContent:'${initials(p.name)}'}))">` : `<div class="ph ${catG(p.category)}">${initials(p.name)}</div>`}
        ${inCart ? `<span class="count">${inCart}</span>` : ""}
        <div class="name">${esc(p.name)}</div>
        <div class="meta">${RM(p.retail_price)} · ${Math.max(0, left - inCart)} left</div></button>`;
    }).join("") || `<div class="empty">No pieces match.</div>`}</div>
    ${n ? `<div class="cartbar"><div><div class="small">${n} piece${n > 1 ? "s" : ""} in this sale</div><div class="num" style="font-size:20px;font-weight:700">${RM(cartGross())}</div></div><button class="btn" id="review">Continue</button></div>` : ""}`;
  $("#sellAt").onchange = e => { state.sellAt = e.target.value; localSet("sellAt", e.target.value); state.cart = {}; render(); };
  $("#search").oninput = e => { state.search = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#search"); i.focus(); i.setSelectionRange(pos, pos); };
  $("#grid").onclick = e => {
    const b = e.target.closest(".tile"); if (!b) return;
    const sku = b.dataset.sku, left = stockAt(t.stockLoc, sku), have = state.cart[sku] || 0;
    if (have >= left) toast("Stock here says none left. Added anyway — fix the count later in Stock.");
    state.cart[sku] = have + 1; render();
  };
  $("#newMarket").onclick = newMarketSheet;
  $("#today").onclick = () => todaySheet(t);
  if ($("#review")) $("#review").onclick = () => reviewSheet(t);
  if ($("#bring")) $("#bring").onclick = () => moveSheet({ to: t.market.id, from: workshop()?.id, title: `Bring stock to ${t.market.name}` });
  if ($("#endMarket")) $("#endMarket").onclick = () => endMarketSheet(t.market);
}

function reviewSheet(t) {
  const draw = () => {
    const lines = cartLines(), gross = cartGross(), disc = Math.min(Number(state.discount) || 0, gross);
    openSheet(`
      <h2 style="margin-top:0">Sale at ${esc(t.name)}</h2>
      <div class="list tight">${lines.map(l => `<div class="row"><div class="grow"><div class="title">${esc(l.p.name)}</div><div class="small muted">${RM(l.p.retail_price)} each</div></div>
        <button class="chip" data-d="-1" data-sku="${l.p.sku}" aria-label="One fewer">−</button><span class="num">${l.qty}</span><button class="chip" data-d="1" data-sku="${l.p.sku}" aria-label="One more">+</button></div>`).join("")}</div>
      <label class="field"><span>Discount on this sale (RM)</span><input id="disc" type="number" inputmode="decimal" min="0" step="0.01" value="${state.discount || ""}"></label>
      <div class="chips">${PAYMENTS.map(p => `<button class="chip" data-pay="${p}" aria-pressed="${state.payment === p}">${p}</button>`).join("")}</div>
      <div class="row" style="margin:12px 0"><span>Total</span><strong class="num" style="font-size:22px">${RM(gross - disc)}</strong></div>
      <button class="btn primary block" id="complete">Complete sale</button>
      <div class="btns"><button class="btn" id="clear">Clear cart</button><button class="btn" id="close">Keep selling</button></div>`, root => {
      root.querySelectorAll("[data-d]").forEach(b => b.onclick = () => { state.cart[b.dataset.sku] = Math.max(0, (state.cart[b.dataset.sku] || 0) + Number(b.dataset.d)); if (!cartLines().length) { closeSheet(); render(); } else draw(); });
      root.querySelectorAll("[data-pay]").forEach(b => b.onclick = () => { state.payment = b.dataset.pay; draw(); });
      root.querySelector("#disc").onchange = e => { state.discount = Number(e.target.value) || 0; draw(); };
      root.querySelector("#clear").onclick = () => { state.cart = {}; state.discount = 0; closeSheet(); render(); };
      root.querySelector("#close").onclick = () => { closeSheet(); render(); };
      root.querySelector("#complete").onclick = () => completeSale(t);
    });
  };
  draw();
}

function completeSale(t) {
  const lines = cartLines(); if (!lines.length) return;
  const gross = cartGross(), disc = Math.min(Number(state.discount) || 0, gross);
  const now = new Date(), cart = uuid(), sm = ym(now) + "-01";
  let left = round2(gross - disc);
  const rows = lines.map((l, i) => {
    const lineGross = l.qty * Number(l.p.retail_price);
    const amt = i === lines.length - 1 ? left : round2(lineGross - (gross ? disc * lineGross / gross : 0));
    left = round2(left - amt);
    return { client_id: uuid(), cart_id: cart, sold_at: now.toISOString(), sale_month: sm, channel: t.channel, location_id: t.locationId,
      sku: l.p.sku, qty: l.qty, unit_price: Number(l.p.retail_price), amount: amt, payment_method: state.payment, notes: disc ? `Discount RM${disc}` : null };
  });
  setOutbox(outbox().concat(rows));
  state.cart = {}; state.discount = 0; closeSheet(); render();
  toast(`Sale saved · ${RM(gross - disc)} ${state.payment}`);
  sync();
}

async function todaySheet(t) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  let server = [];
  try {
    let qy = sb.from("sales").select("*").eq("location_id", t.locationId).eq("channel", t.channel).gte("sold_at", start.toISOString()).order("sold_at", { ascending: false });
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
    <div class="list tight">${Object.entries(carts).map(([k, c]) => `<div class="row"><div class="grow"><div class="title">${c.rows.map(r => `${r.qty}× ${esc(prod(r.sku)?.name || r.sku)}`).join(", ")}</div>
      <div class="small muted">${new Date(c.at).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" })} · ${esc(c.pay || "")}</div></div>
      <span class="num">${RM(c.rows.reduce((x, r) => x + Number(r.amount), 0))}</span><button class="link" data-cart="${esc(k)}" style="background:none;border:0;color:var(--rust)">Remove</button></div>`).join("") || `<div class="empty">No sales yet today.</div>`}</div>
    <button class="btn block" id="close">Close</button>`, root => {
    root.querySelector("#close").onclick = closeSheet;
    root.querySelectorAll("[data-cart]").forEach(b => b.onclick = async () => {
      if (!confirm("Remove this sale? The pieces go back into stock.")) return;
      const k = b.dataset.cart;
      setOutbox(outbox().filter(r => (r.cart_id || r.client_id) !== k));
      try { const rows = carts[k].rows.filter(r => r.id); if (rows.length) await q(sb.from("sales").delete().in("id", rows.map(r => r.id))); } catch (e) { return fail(e); }
      await loadStock(); toast("Sale removed"); todaySheet(t); render();
    });
  });
}

function newMarketSheet() {
  const today = ymd(new Date());
  openSheet(`
    <h2 style="margin-top:0">New market</h2>
    <form id="f">
      <label class="field"><span>Market name</span><input name="name" required placeholder="Sulap Artisan"></label>
      <label class="field"><span>Venue</span><input name="venue" placeholder="Suria Sabah"></label>
      <div class="two"><label class="field"><span>First day</span><input name="start" type="date" value="${today}"></label>
      <label class="field"><span>Last day</span><input name="end" type="date" value="${today}"></label></div>
      <label class="field"><span>Booth fee (RM)</span><input name="fee" type="number" step="0.01" min="0" inputmode="decimal"></label>
      <label style="display:flex;gap:8px;align-items:center;margin-bottom:12px"><input type="checkbox" name="addFee" checked style="width:auto;min-height:0"> Add the fee to expenses</label>
      <button class="btn primary block" type="submit">Create market</button>
    </form>`, root => root.querySelector("#f").onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target), fee = Number(f.get("fee")) || null;
      try {
        const [m] = await q(sb.from("locations").insert({ name: f.get("name").trim(), type: "market", venue: f.get("venue") || null, start_date: f.get("start") || null, end_date: f.get("end") || null, fee, active: true }).select());
        if (fee && f.get("addFee")) await q(sb.from("expenses").insert({ spent_on: f.get("start") || today, expense_group: "Operating Expenses", category: "Market Fee", amount: fee, description: m.name, paid_to: f.get("venue") || m.name }));
        state.locations.push(m); state.sellAt = m.id; localSet("sellAt", m.id); localSet("locations", state.locations);
        closeSheet(); toast("Market created. Bring stock next."); render();
      } catch (err) { fail(err); }
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
    const [sales, moves] = await Promise.all([
      q(sb.from("sales").select("sale_month,sold_at,report_id,sku,qty,unit_price,amount,notes").eq("location_id", r.id).eq("channel", "retailer").order("sold_at")),
      q(sb.from("stock_movements").select("moved_on,sku,qty,from_location,to_location,reason,ref,notes,created_at").or(`to_location.eq.${r.id},from_location.eq.${r.id}`).order("moved_on"))
    ]);
    const d = { sales, moves }; localSet(key, d); return d;
  } catch (e) { throw e; }
}

const MONTH = 30.4375 * 864e5;
const fmtMonth = s => monthStart(s.slice(0, 7)).toLocaleDateString("en-MY", { month: "short", year: "numeric" });
const pct = x => x == null || !isFinite(x) ? "—" : Math.round(x * 100) + "%";
const dec = (x, n = 1) => x == null || !isFinite(x) ? "—" : Number(x).toFixed(n);

/* per-item numbers, same idea as the sheet's Product Analysis (with the fixes you asked for) */
function analyseRetailer(r, d) {
  const rate = Number(r.commission_rate) || 0, today = new Date(), curM = ym(today);
  const skus = new Set([...state.codes.filter(c => c.location_id === r.id).map(c => c.sku), ...d.sales.map(s => s.sku), ...d.moves.map(m => m.sku)].filter(Boolean));
  const items = [];
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
    let role;
    if (p.status !== "Active") role = "Non-Core";
    else if (stage === "Too New") role = "Too New";
    else if (velocity >= 2 && (st ?? 0) >= 0.6) role = "Core";
    else if (velocity >= 1 || (st ?? 0) >= 0.5) role = "Promising";
    else role = "Weak";
    const movement = !sold ? "Never Sold" : sinceLast >= 3 ? "Dormant" : sinceLast <= 1 ? "Moving" : "Slowing";
    const stockStatus = current <= 0 ? (sold ? "Sold Out" : "No Stock") : !sold ? "No Sales Yet" : cover < 1 ? "Low" : cover > 6 ? "Overstocked" : "Healthy";
    let action;
    if (p.status === "Replaced") action = current > 0 ? "Clear Remaining Stock" : "Use Replacement";
    else if (p.status === "Paused") action = "Hold - Paused";
    else if (p.status === "Discontinued") action = current > 0 ? "Clear Remaining Stock" : "Retired";
    else if (stage === "Too New") action = "Monitor New Product";
    else if (current <= 0 && sold > 0) action = "Priority Restock";
    else if (cover != null && cover < 1) action = "Priority Restock";
    else if (cover != null && cover < 2) action = "Restock Small Batch";
    else if (monthsAvail >= 3 && (movement === "Dormant" || movement === "Never Sold")) action = "Review Design";
    else if (role === "Weak") action = "Monitor Product";
    else action = "Hold Restock";
    items.push({ p, sku, code: codeAt(r.id, sku), stockIn, sold, actual, gross, net: actual * (1 - rate), current, value: current * price, price,
      first, monthsAvail, firstSale, lastSale, sinceLast, velocity, cover, st, restocks, stage, role, movement, stockStatus, action,
      realisation: gross ? actual / gross : null });
  }
  items.sort((a, b) => String(a.code || "~" + a.p.name).localeCompare(String(b.code || "~" + b.p.name)));
  return items;
}

const ACTION_TONE = { "Priority Restock": "rust", "Restock Small Batch": "brass", "Clear Remaining Stock": "brass", "Review Design": "brass", "Use Replacement": "", "Hold - Paused": "", "Retired": "", "Monitor New Product": "green", "Monitor Product": "", "Hold Restock": "green" };
const ROLE_TONE = { Core: "green", Promising: "brass", "Too New": "", Weak: "rust", "Non-Core": "" };
const tag = (t, tone) => `<span class="tag ${tone || ""}">${esc(t)}</span>`;
const codeChip = it => it.code ? `<span class="code">${esc(it.code)}</span>` : `<span class="code none">No code</span>`;

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
        <div class="stats">${st("box", `${stockTotalAt(r.id)} pieces`)}${st("coin", owed ? `${RM(owed)} owed` : "Nothing owed")}${st("pct", `${Math.round(Number(r.commission_rate) * 100)}% commission`)}</div>
        <div class="detail-actions"><button class="btn" data-a="paste">Paste sales</button><button class="btn" data-a="send">Send stock</button><button class="btn" data-a="tally">Tally</button><button class="btn" data-a="pay">Payouts</button></div>
      </div>
      <div class="detail-body">
        <div class="ttabs">${tabs.map(([k, l]) => `<button data-rt="${k}" aria-pressed="${state.rTab === k}">${l}</button>`).join("")}</div>`;
  const bindHead = () => {
    $("#back").onclick = () => go("retailers");
    view.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => { state.rTab = b.dataset.rt; state.rFilter = null; renderRetailer(); });
    view.querySelectorAll("[data-a]").forEach(b => b.onclick = () => ({ paste: pasteSalesSheet, tally: tallySheet, pay: payoutsSheet, send: sendStockSheet })[b.dataset.a](r));
  };
  const draw = d => {
    const items = analyseRetailer(r, d);
    const body = { dash: rDashboard, stock: rStock, in: rStockIn, sales: rSales, analysis: rAnalysis }[state.rTab](r, d, items);
    const open = [...view.querySelectorAll("details[data-key][open]")].map(e => e.dataset.key);
    view.innerHTML = head() + body + "</div></div>";
    view.querySelectorAll("details[data-key]").forEach(e => { if (open.includes(e.dataset.key)) e.open = true; });
    bindHead();
    view.querySelectorAll("[data-item]").forEach(e => e.onclick = ev => { ev.preventDefault(); itemAtRetailerSheet(r, items.find(i => i.sku === e.dataset.item)); });
    /* switching sub-tabs, filters and months redraws from memory: no waiting, no jump */
    view.querySelectorAll("[data-rt]").forEach(b => b.onclick = () => { state.rTab = b.dataset.rt; state.rFilter = null; draw(d); });
    view.querySelectorAll("[data-f]").forEach(b => b.onclick = () => { state.rFilter = b.dataset.f === "all" ? null : b.dataset.f; draw(d); });
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
  const order = ["Priority Restock", "Restock Small Batch", "Hold Restock", "Monitor New Product", "Monitor Product", "Review Design", "Clear Remaining Stock", "Hold - Paused", "Use Replacement", "Retired"];
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
        <div class="small muted">${codeChip(i)} Stock ${i.current} · Sold ${i.sold} · ${dec(i.velocity)}/mo${i.cover != null ? ` · ${dec(i.cover)} mo cover` : ""}</div></div>${tag(i.role, ROLE_TONE[i.role])}</div>`).join("")}</div>
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

function rStock(r, d, items) {
  const f = state.rFilter || "in";
  const list = items.filter(i => f === "all" ? true : f === "in" ? i.current > 0 : f === "nocode" ? !i.code : i.current <= 0);
  const total = items.reduce((t, i) => t + Math.max(0, i.current), 0), value = items.reduce((t, i) => t + Math.max(0, i.value), 0);
  const noCode = items.filter(i => !i.code && i.current > 0).length;
  return `
    <div class="figures"><div class="figure"><div class="label">Pieces on shelf</div><div class="value">${total}</div></div><div class="figure"><div class="label">Stock value</div><div class="value">${RM(value)}</div></div></div>
    ${noCode ? `<div class="warn-banner">${noCode} item${noCode > 1 ? "s" : ""} on the shelf still need${noCode > 1 ? "" : "s"} a ${esc(r.name)} code. Tap to add it.</div>` : ""}
    <div class="chips" style="margin-top:0">${[["in", "In stock"], ["out", "Sold out"], ["nocode", "No code"], ["all", "All"]].map(([k, l]) => `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${l}</button>`).join("")}</div>
    ${groupByCategory(list.map(i => i.p)).map(([cat, ps]) => { const its = ps.map(p => list.find(i => i.sku === p.sku)); const n = its.reduce((t, i) => t + Math.max(0, i.current), 0);
      return `<details class="group" data-key="rs:${esc(cat)}"><summary>${catIco(cat)}<span class="grow">${esc(cat)}<span class="small muted" style="display:block;font-weight:500">${its.length} item${its.length > 1 ? "s" : ""} · ${RM(its.reduce((t, i) => t + Math.max(0, i.value), 0))}</span></span><span class="count">${n}</span>${CHEV}</summary>
      <div class="inner">${its.map(i => `<div class="row" data-item="${i.sku}"><div class="grow"><div class="title" style="white-space:normal">${esc(i.p.name)}</div>
      <div class="small muted">${codeChip(i)} In ${i.stockIn} · Sold ${i.sold} · ${RM(i.price)}${i.current > 0 ? ` · Value ${RM(i.value)}` : ""}</div>
      <div style="margin-top:5px">${tag(i.action, ACTION_TONE[i.action])}</div></div>
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
      <div class="figure lead"><div class="label">${fmtMonth(mon)} · ${T("qty")} pieces · ${esc(lines[0]?.report_id || "")}</div><div class="value">${RM(T("amt"))}</div></div>
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
  const f = state.rFilter;
  const roles = ["Core", "Promising", "Too New", "Weak", "Non-Core"];
  const list = items.filter(i => !f || i.role === f).sort((a, b) => roles.indexOf(a.role) - roles.indexOf(b.role) || b.sold - a.sold);
  return `
    <p class="small muted" style="margin:0 2px 10px">Sold/mo = units sold ÷ full months on the shelf (at least 1), so new items aren't inflated. Cover = months of stock left at that pace.</p>
    <div class="chips" style="margin-top:0"><button class="chip" data-f="all" aria-pressed="${!f}">All · ${items.length}</button>${roles.map(k => { const n = items.filter(i => i.role === k).length; return n ? `<button class="chip" data-f="${k}" aria-pressed="${f === k}">${k} · ${n}</button>` : ""; }).join("")}</div>
    <div class="list">${list.map(i => `<div class="row" data-item="${i.sku}" style="display:block">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div class="title" style="white-space:normal">${esc(i.p.name)}</div>${tag(i.role, ROLE_TONE[i.role])}</div>
      <div class="small muted" style="margin:3px 0 8px">${codeChip(i)} ${esc(i.p.family || "")} · ${i.stage}${i.first ? ` · on shelf ${dec(i.monthsAvail)} mo` : ""}</div>
      <div class="mini-grid">
        <div><span>Sold</span><b>${i.sold}</b></div><div><span>Stock</span><b>${i.current}</b></div><div><span>Sold/mo</span><b>${dec(i.velocity)}</b></div>
        <div><span>Cover</span><b>${i.cover == null ? "—" : dec(i.cover)}</b></div><div><span>Sell-through</span><b>${pct(i.st)}</b></div><div><span>Last sale</span><b>${i.lastSale ? monthStart(i.lastSale).toLocaleDateString("en-MY", { month: "short", year: "2-digit" }) : "—"}</b></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">${tag(i.action, ACTION_TONE[i.action])}${tag(i.movement)}${tag(i.stockStatus)}</div>
    </div>`).join("")}</div>`;
}

/* tap an item on a retailer page: its numbers + set the shop's code */
function itemAtRetailerSheet(r, it) {
  if (!it) return;
  const p = it.p;
  openSheet(`
    <h2>${esc(p.name)}</h2>
    <p class="small muted">${esc(itemSub(p))} · Original price ${RM(p.retail_price)} · ${esc(p.status)}</p>
    <form id="cf" style="margin-bottom:12px">
      <div class="two"><label class="field"><span>${esc(r.name)} code</span><input id="code" value="${esc(it.code || "")}" placeholder="e.g. APO091" autocapitalize="characters"></label>
      <label class="field"><span>${esc(r.name)} price (RM)</span><input id="price" type="number" step="0.01" min="0" inputmode="decimal" value="${it.price}"></label></div>
      <button class="btn block">Save code & price</button></form>
    <div class="figures">
      <div class="figure"><div class="label">On shelf</div><div class="value">${it.current}</div></div>
      <div class="figure"><div class="label">Sold</div><div class="value">${it.sold}</div></div>
      <div class="figure"><div class="label">Stock in</div><div class="value">${it.stockIn}</div></div>
      <div class="figure"><div class="label">Actual sales</div><div class="value">${RM(it.actual)}</div></div>
    </div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">${tag(it.role, ROLE_TONE[it.role])}${tag(it.action, ACTION_TONE[it.action])}${tag(it.stockStatus)}</div>
    <div class="btns"><button class="btn" id="adj">Fix count</button><button class="btn" id="edit">Edit item</button></div>`, root => {
    root.querySelector("#cf").onsubmit = async e => {
      e.preventDefault();
      const code = root.querySelector("#code").value.trim().toUpperCase() || null;
      const pv = root.querySelector("#price").value, price = pv === "" ? null : Number(pv);
      try {
        const other = code && skuForCode(r.id, code);
        if (other && other !== p.sku) return toast(`${code} is already used for ${prod(other)?.name}`);
        if (!code && price == null) await q(sb.from("retailer_codes").delete().eq("location_id", r.id).eq("sku", p.sku));
        else await q(sb.from("retailer_codes").upsert({ location_id: r.id, sku: p.sku, code, price }, { onConflict: "location_id,sku" }));
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

function pasteSalesSheet(r) {
  openSheet(`
    <h2>${esc(r.name)} sales report</h2>
    <label class="field"><span>Sales month</span><input id="mon" type="month" value="${ym(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1))}"></label>
    <label class="field"><span>Paste one line per item: ${esc(r.name)} code, quantity, amount</span><textarea id="txt" placeholder="APO055	2	154&#10;APO057	2	138"></textarea></label>
    <button class="btn primary block" id="prev">Check report</button><div id="out"></div>`, root => {
    root.querySelector("#prev").onclick = async () => {
      const mon = root.querySelector("#mon").value, { lines, errors } = parseLines(root.querySelector("#txt").value, true, r);
      const reportId = `${r.code}-SALES-${mon}`;
      let existing = [];
      try { existing = await q(sb.from("sales").select("id").eq("report_id", reportId)); } catch {}
      const total = round2(lines.reduce((t, l) => t + l.amount, 0)), pcs = lines.reduce((t, l) => t + l.qty, 0);
      const comm = round2(total * Number(r.commission_rate));
      root.querySelector("#out").innerHTML = `
        ${errors.length ? `<div class="warn-banner" style="margin-top:12px">${errors.map(esc).join("<br>")}</div>` : ""}
        <div class="scroll-x"><table class="simple"><tr><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr>
        ${lines.map(l => { const full = l.qty * shopPrice(r.id, l.sku); return `<tr><td>${esc(prod(l.sku).name)}<div class="small muted">${esc(l.code)}${l.amount < full ? ` · <span style="color:var(--rust)">below retail (${RM(full)})</span>` : ""}</div></td><td class="r">${l.qty}</td><td class="r">${RM(l.amount)}</td></tr>`; }).join("")}
        <tr><td><strong>${pcs} pieces</strong></td><td></td><td class="r"><strong>${RM(total)}</strong></td></tr>
        <tr><td class="muted">Commission ${Math.round(Number(r.commission_rate) * 100)}%</td><td></td><td class="r muted">−${RM(comm)}</td></tr>
        <tr><td>You receive</td><td></td><td class="r"><strong>${RM(total - comm)}</strong></td></tr></table></div>
        ${existing.length ? `<div class="warn-banner" style="margin-top:10px">${monthLabel(mon)} already has ${existing.length} lines saved. Saving replaces them with this report.</div>` : ""}
        ${lines.length ? `<button class="btn primary block" id="save" style="margin-top:10px">Save ${monthLabel(mon)} sales</button>` : ""}`;
      const s = root.querySelector("#save"); if (!s) return;
      s.onclick = async () => {
        const ms = monthStart(mon), last = new Date(ms.getFullYear(), ms.getMonth() + 1, 0, 12);
        try {
          if (existing.length) await q(sb.from("sales").delete().eq("report_id", reportId));
          await q(sb.from("sales").insert(lines.map(l => ({ sold_at: last.toISOString(), sale_month: mon + "-01", channel: "retailer", location_id: r.id, report_id: reportId, sku: l.sku, qty: l.qty, unit_price: shopPrice(r.id, l.sku), amount: l.amount }))));
          await q(sb.from("payouts").upsert({ location_id: r.id, period_month: mon + "-01", sales_amount: total, commission: comm, net_amount: round2(total - comm) }, { onConflict: "location_id,period_month" }));
          await loadStock(); closeSheet(); toast(`${monthLabel(mon)} saved · ${pcs} pieces`); state.rTab = "sales"; state.rMonth = mon; afterRetailerSave();
        } catch (e) { fail(e); }
      };
    };
  });
}

function tallySheet(r) {
  openSheet(`
    <h2>Tally ${esc(r.name)} stock</h2>
    <label class="field"><span>Paste the shop's stock balance: code and quantity per line</span><textarea id="txt" placeholder="APO042	4&#10;APO044	6"></textarea></label>
    <button class="btn primary block" id="go">Compare</button><div id="out"></div>`, root => root.querySelector("#go").onclick = () => {
      const { lines, errors } = parseLines(root.querySelector("#txt").value, false, r);
      const shop = Object.fromEntries(lines.map(l => [l.sku, l.qty]));
      const skus = new Set([...Object.keys(shop), ...state.products.filter(p => stockAt(r.id, p.sku) !== 0).map(p => p.sku)]);
      const diffs = [...skus].map(sku => ({ sku, app: stockAt(r.id, sku), shop: shop[sku] || 0 })).filter(d => d.app !== d.shop);
      const pcs = lines.reduce((t, l) => t + l.qty, 0);
      root.querySelector("#out").innerHTML = (errors.length ? `<div class="warn-banner" style="margin-top:12px">${errors.map(esc).join("<br>")}</div>` : "") + (diffs.length ? `
        <h3 style="margin-top:14px">${diffs.length} don't match</h3>
        <table class="simple"><tr><th>Item</th><th class="r">App</th><th class="r">Shop</th></tr>${diffs.map(d => `<tr><td>${esc(prod(d.sku)?.name)}<div class="small muted">${esc(codeAt(r.id, d.sku) || "No code")}</div></td><td class="r">${d.app}</td><td class="r">${d.shop}</td></tr>`).join("")}</table>
        <p class="small muted">Check for a missing sales report or delivery first. If the shop's count is right, accept it.</p>
        <button class="btn block" id="accept">Use the shop's counts</button>`
        : `<div class="card" style="margin-top:12px"><h3>Everything matches</h3><p class="muted">${lines.length} items, ${pcs} pieces.</p></div>`);
      const a = root.querySelector("#accept"); if (a) a.onclick = async () => {
        const rows = diffs.map(d => d.shop > d.app ? { sku: d.sku, qty: d.shop - d.app, to_location: r.id, reason: "correction", notes: "Shop stock tally" } : { sku: d.sku, qty: d.app - d.shop, from_location: r.id, reason: "correction", notes: "Shop stock tally" });
        try { await q(sb.from("stock_movements").insert(rows)); await loadStock(); closeSheet(); toast("Counts updated"); afterRetailerSave(); } catch (e) { fail(e); }
      };
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
      <div class="small muted">${c ? `<span class="code">${esc(c)}</span> ${RM(shopPrice(r.id, p.sku))}` : `<span style="display:flex;gap:6px;margin-top:4px"><input data-code="${p.sku}" placeholder="Code (optional)" class="mini-in"><input data-price="${p.sku}" type="number" step="0.01" min="0" inputmode="decimal" placeholder="Price ${Number(p.retail_price)}" class="mini-in" style="width:96px"></span>`} <span data-have="${p.sku}"></span></div></div>
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
      for (const c of codes.filter(c => c.code)) { const o = skuForCode(r.id, c.code); if (o && o !== c.sku) return toast(`${c.code} is already ${prod(o)?.name}`); }
      const typed = codes.filter(c => c.code).map(c => c.code);
      if (new Set(typed).size !== typed.length) return toast("The same code is typed twice");
      const ws = workshop().id, date = root.querySelector("#d").value, ref = root.querySelector("#ref").value.trim() || null;
      try {
        if (codes.length) await q(sb.from("retailer_codes").upsert(codes.map(c => ({ location_id: r.id, ...c })), { onConflict: "location_id,sku" }));
        await q(sb.from("stock_movements").insert(rows.map(x => ({ moved_on: date, sku: x.sku, qty: x.qty, to_location: r.id, from_location: src === "ws" ? ws : null, reason: src === "ws" ? "transfer" : "restock", ref }))));
        await loadAll(); closeSheet();
        const missing = rows.filter(x => !codeAt(r.id, x.sku)).length;
        toast(`${rows.reduce((t, x) => t + x.qty, 0)} pieces sent to ${r.name}${missing ? ` · ${missing} without a code yet` : ""}`);
        state.rTab = "in"; afterRetailerSave();
      } catch (e) { fail(e); }
    };
  });
}

async function payoutsSheet(r) {
  let rows = [];
  try { rows = await q(sb.from("payouts").select("*").eq("location_id", r.id).order("period_month", { ascending: false })); } catch (e) { return fail(e); }
  openSheet(`
    <h2 style="margin-top:0">${esc(r.name)} payouts</h2>
    <div class="list tight">${rows.map(p => `<div class="row"><div class="grow"><div class="title">${monthLabel(p.period_month.slice(0, 7))} sales</div>
      <div class="small muted">${p.sales_amount ? `Sales ${RM(p.sales_amount)} · ` : ""}${p.paid ? `Paid ${p.paid_on ? shortDate(p.paid_on) : ""}` : "Not paid yet"}</div></div>
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
    <input class="search" id="search" type="search" placeholder="Search pieces" value="${esc(state.search)}">
    ${groupByCategory(rows.map(x => x.p)).map(([cat, ps]) => {
      const n = ps.reduce((t, p) => t + Math.max(0, stockAt(L, p.sku)), 0);
      return `<details class="group" data-cat="${esc(cat)}" ${s || state.openCats.has(cat) ? "open" : ""}><summary>${catIco(cat)}<span class="grow">${esc(cat)}<span class="small muted" style="display:block;font-weight:500">${ps.length} item${ps.length > 1 ? "s" : ""}</span></span><span class="count">${n}</span>${CHEV}</summary>
      <div class="inner">${ps.map(p => { const k = stockAt(L, p.sku);
        const where = L === "all" ? places.map(l => [l, stockAt(l.id, p.sku)]).filter(([, q]) => q).map(([l, q]) => `${esc(l.name)} ${q}`).join(" · ") : "";
        return `<div class="row" data-sku="${p.sku}"><div class="grow"><div class="title" style="white-space:normal">${esc(p.name)}</div><div class="small muted">${[p.size && p.size !== "Free" ? esc(p.size) : null, p.status !== "Active" ? esc(p.status) : null, where || null].filter(Boolean).join(" · ")}</div></div>
          <span class="num" style="font-size:18px;font-weight:700;${k <= 0 ? "color:var(--rust)" : ""}">${k}</span></div>`; }).join("")}</div></details>`;
    }).join("") || `<div class="empty">Nothing here.</div>`}
    <p class="small muted">Tap a category to open it, then tap an item to fix its count.</p>`;
  view.querySelectorAll("details[data-cat]").forEach(d => d.ontoggle = () => { if (s) return; d.open ? state.openCats.add(d.dataset.cat) : state.openCats.delete(d.dataset.cat); });
  view.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { state.stockLoc = b.dataset.l === "all" ? "all" : Number(b.dataset.l); render(); });
  $("#search").oninput = e => { state.search = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#search"); i.focus(); i.setSelectionRange(pos, pos); };
  $("#add").onclick = () => moveSheet({ to: L === "all" ? workshop().id : L, from: null, title: "Add new pieces", restock: true });
  $("#move").onclick = () => moveSheet({ from: workshop().id, to: retailers()[0]?.id, title: "Move stock" });
  $("#products").onclick = productsSheet;
  $("#newItem").onclick = () => productForm(null);
  view.querySelectorAll("[data-sku]").forEach(r => r.onclick = () => adjustSheet(prod(r.dataset.sku), L === "all" ? workshop().id : L));
}

function locOptions(sel, includeNone) {
  const opts = state.locations.filter(l => l.active || l.id === Number(sel));
  return (includeNone ? `<option value="">New pieces (not from anywhere)</option>` : "") + opts.map(l => `<option value="${l.id}" ${Number(sel) === l.id ? "selected" : ""}>${esc(l.name)}</option>`).join("");
}

function moveSheet({ from, to, title, restock }) {
  const list = activeProducts();
  openSheet(`
    <h2 style="margin-top:0">${esc(title)}</h2>
    <div class="two">
      <label class="field"><span>From</span><select id="from">${restock ? `<option value="">New pieces</option>` : locOptions(from, true)}</select></label>
      <label class="field"><span>To</span><select id="to">${locOptions(to)}</select></label></div>
    <div class="two"><label class="field"><span>Date</span><input id="d" type="date" value="${ymd(new Date())}"></label>
    <label class="field"><span>Reference</span><input id="ref" placeholder="OCT-01"></label></div>
    <div class="list tight" id="pick">${list.map(p => `<div class="row"><div class="grow"><div class="title small">${esc(p.name)}</div><div class="small muted" data-have="${p.sku}" data-sub="${esc(itemSub(p))}"></div></div>
      <input type="number" inputmode="numeric" min="0" step="1" data-sku="${p.sku}" style="width:80px" placeholder="0"></div>`).join("")}</div>
    <button class="btn primary block" id="go">Save</button>`, root => {
    const showHave = () => { const f = root.querySelector("#from").value; root.querySelectorAll("[data-have]").forEach(e => e.textContent = f ? `${stockAt(Number(f), e.dataset.have)} at source` : e.dataset.sub); };
    root.querySelector("#from").onchange = showHave; showHave();
    root.querySelector("#go").onclick = async () => {
      const f = root.querySelector("#from").value, t = root.querySelector("#to").value;
      if (f && f === t) return toast("From and To are the same place");
      const rows = [...root.querySelectorAll("[data-sku]")].map(i => ({ sku: i.dataset.sku, qty: parseInt(i.value, 10) || 0 })).filter(x => x.qty > 0)
        .map(x => ({ ...x, moved_on: root.querySelector("#d").value, from_location: f ? Number(f) : null, to_location: Number(t), reason: f ? (loc(t)?.type === "workshop" ? "return" : "transfer") : "restock", ref: root.querySelector("#ref").value || null }));
      if (!rows.length) return toast("Enter a quantity for at least one piece");
      try { await q(sb.from("stock_movements").insert(rows)); await loadStock(); closeSheet(); toast(`${rows.reduce((a, r) => a + r.qty, 0)} pieces saved`); render(); } catch (e) { fail(e); }
    };
  });
}

function adjustSheet(p, at) {
  openSheet(`
    <h2 style="margin-top:0">${esc(p.name)}</h2>
    <p class="muted small">${esc(itemSub(p))}${itemSub(p) ? " · " : ""}${RM(p.retail_price)}</p>
    <label class="field"><span>Place</span><select id="at">${locOptions(at)}</select></label>
    <p>App count here: <strong id="have">${stockAt(at, p.sku)}</strong></p>
    <div class="two"><label class="field"><span>Real count</span><input id="real" type="number" inputmode="numeric" step="1"></label>
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

function productsSheet() {
  const list = state.products.slice().sort((a, b) => (a.status !== "Active") - (b.status !== "Active") || a.name.localeCompare(b.name));
  openSheet(`
    <h2>All items</h2>
    <button class="btn primary block" id="new">+ New item</button>
    <div class="list tight" style="margin-top:12px">${list.map(p => `<div class="row" data-sku="${p.sku}"><div class="grow"><div class="title">${esc(p.name)}</div><div class="small muted">${esc(itemSub(p))}${p.status !== "Active" ? ` · ${esc(p.status)}` : ""}</div></div><span class="num">${RM(p.retail_price)}</span></div>`).join("")}</div>`, root => {
    root.querySelector("#new").onclick = () => productForm(null);
    root.querySelectorAll("[data-sku]").forEach(r => r.onclick = () => productForm(prod(r.dataset.sku)));
  });
}
function productForm(p) {
  const v = p || { status: "Active" };
  const field = (k, label, type = "text", ph = "") => `<label class="field"><span>${label}</span><input name="${k}" type="${type}" ${type === "number" ? 'step="0.01" min="0" inputmode="decimal"' : ""} placeholder="${ph}" value="${esc(v[k] ?? "")}"></label>`;
  const list = (k, vals) => `<datalist id="dl-${k}">${[...new Set(state.products.map(x => x[k]).filter(Boolean))].sort().map(x => `<option value="${esc(x)}">`).join("")}</datalist>`;
  const withList = (k, label, ph) => field(k, label, "text", ph).replace("<input ", `<input list="dl-${k}" `) + list(k);
  const codes = p ? state.codes.filter(c => c.sku === p.sku).map(c => `${esc(loc(c.location_id)?.name)}: ${esc(c.code || "no code")}${c.price != null ? " at " + RM(c.price) : ""}`).join(" · ") : "";
  openSheet(`
    <h2>${p ? "Edit item" : "New item"}</h2>
    <form id="f">
      ${field("name", "Item name", "text", "Twisting Liana Vines Bracelet (Small)")}
      <div class="two">${withList("family", "Family", "TLV Bracelet")}${withList("collection", "Collection", "TLV")}</div>
      <div class="two">${withList("category", "Category", "Bracelet")}${withList("size", "Size", "Small")}</div>
      <div class="two">${field("retail_price", "Original price (RM)", "number")}
        <label class="field"><span>Status</span><select name="status">${["Active", "Paused", "Replaced", "Discontinued"].map(s => `<option ${v.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label></div>
      ${p ? "" : `<label class="field"><span>Pieces made so far (goes into workshop stock)</span><input name="start_qty" type="number" min="0" step="1" inputmode="numeric" placeholder="0"></label>`}
      ${field("photo", "Google Drive photo ID (optional)")}
      ${field("notes", "Notes (optional)")}
      <p class="small muted" style="margin-top:-4px">Used at markets and online. Each shop's own price is set on that shop's page.</p>
      ${codes ? `<p class="small muted">Shops: ${codes}</p>` : ""}
      <button class="btn primary block">${p ? "Save item" : "Add item"}</button>
    </form>`, root => root.querySelector("#f").onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      const start = parseInt(f.start_qty, 10) || 0; delete f.start_qty;
      for (const k in f) if (typeof f[k] === "string") { f[k] = f[k].trim(); if (f[k] === "") f[k] = null; }
      f.retail_price = Number(f.retail_price) || 0;
      if (!f.name) return toast("Give the item a name");
      try {
        if (p) await q(sb.from("products").update(f).eq("sku", p.sku));
        else {
          f.sku = newKey();
          await q(sb.from("products").insert(f));
          if (start > 0) await q(sb.from("stock_movements").insert({ sku: f.sku, qty: start, to_location: workshop().id, reason: "restock", notes: "New item" }));
        }
        await loadAll(); closeSheet(); toast(p ? "Item saved" : start ? `${f.name} added · ${start} in workshop` : `${f.name} added`); render();
      } catch (err) { fail(err); }
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
      q(sb.from("sales").select("sold_at,amount,channel,location_id,payment_method").neq("channel", "retailer").gte("sold_at", ys.toISOString()).lt("sold_at", ye.toISOString())),
      q(sb.from("payouts").select("*").eq("paid", true).gte("paid_on", ymd(ys)).lt("paid_on", ymd(ye))),
      q(sb.from("expenses").select("*").gte("spent_on", ymd(ys)).lt("spent_on", ymd(ye)).order("spent_on", { ascending: false }))
    ]);
  } catch { if (!cached) view.innerHTML = `<h1 class="big">Money in<br>&amp; out</h1><div class="warn-banner">You're offline. Accounts need a connection.</div>`; return; }
  if (state.tab !== "accounts") return;
  if (!cached || JSON.stringify([sales, pays, exps]) !== JSON.stringify(cached)) { localSet(ck, [sales, pays, exps]); drawAccounts(sales, pays, exps); }
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
  mSales.forEach(s => { const k = ymd(new Date(s.sold_at)) + "|" + s.location_id + "|" + s.channel; grouped[k] = (grouped[k] || 0) + Number(s.amount); });
  const incomeRows = [
    ...mPays.map(p => ({ d: p.paid_on, t: `${loc(p.location_id)?.name} payout`, s: `${monthLabel(p.period_month.slice(0, 7))} sales`, a: Number(p.paid_amount ?? p.net_amount) })),
    ...Object.entries(grouped).map(([k, a]) => { const [d, l, c] = k.split("|"); return { d, t: c === "online" ? "Online orders" : loc(l)?.name || "Market", s: c === "online" ? "Online" : "Market", a }; })
  ].sort((a, b) => b.d.localeCompare(a.d));

  const yearIn = months.reduce((t, m) => t + inc[m], 0), yearOut = months.reduce((t, m) => t + out[m], 0);
  const byCat = {}; exps.forEach(e => { const k = e.expense_group + "|" + e.category; byCat[k] = (byCat[k] || 0) + Number(e.amount); });

  view.innerHTML = `<h1 class="big">Money in<br>&amp; out</h1>
    <label class="field"><span>Month</span><input id="mon" type="month" value="${mon}"></label>
    <div class="figures">
      <div class="figure lead"><div class="label">Left in ${monthStart(mon).toLocaleDateString("en-MY", { month: "long" })}</div><div class="value">${RM(inc[mon] - out[mon])}</div></div>
      <div class="figure"><div class="label">Money in</div><div class="value">${RM(inc[mon])}</div></div>
      <div class="figure"><div class="label">Spent</div><div class="value">${RM(out[mon])}</div></div></div>
    <button class="btn primary block" id="addExp">Add an expense</button>
    <h2>Money in</h2>
    <div class="list tight">${incomeRows.map(r => `<div class="row"><div class="grow"><div class="title">${esc(r.t)}</div><div class="small muted">${shortDate(r.d)} · ${esc(r.s)}</div></div><span class="num">${RM(r.a)}</span></div>`).join("") || `<div class="empty">Nothing received this month yet.</div>`}</div>
    <h2>Spent</h2>
    <div class="list tight">${mExps.map(e => `<div class="row" data-exp="${e.id}"><div class="grow"><div class="title">${esc(e.description || e.category)}</div><div class="small muted">${shortDate(e.spent_on)} · ${esc(e.category)}${e.paid_to ? " · " + esc(e.paid_to) : ""}</div></div><span class="num">${RM(e.amount)}</span></div>`).join("") || `<div class="empty">No expenses this month.</div>`}</div>
    <h2>${ms.getFullYear()} by month</h2>
    <div class="card scroll-x"><table class="simple"><tr><th>Month</th><th class="r">In</th><th class="r">Spent</th><th class="r">Left</th></tr>
      ${months.filter(m => inc[m] || out[m]).map(m => `<tr><td>${monthStart(m).toLocaleDateString("en-MY", { month: "short" })}</td><td class="r">${RM(inc[m])}</td><td class="r">${RM(out[m])}</td><td class="r" style="${inc[m] - out[m] < 0 ? "color:var(--rust)" : ""}">${RM(inc[m] - out[m])}</td></tr>`).join("")}
      <tr><td><strong>Year</strong></td><td class="r"><strong>${RM(yearIn)}</strong></td><td class="r"><strong>${RM(yearOut)}</strong></td><td class="r"><strong>${RM(yearIn - yearOut)}</strong></td></tr></table></div>
    <h2>${ms.getFullYear()} profit and loss</h2>
    <div class="card scroll-x"><table class="simple">
      <tr><td>Product sales received</td><td class="r">${RM(yearIn)}</td></tr>
      ${GROUPS.concat(Object.keys(byCat).map(k => k.split("|")[0]).filter(g => !GROUPS.includes(g))).filter((g, i, a) => a.indexOf(g) === i).map(g => {
        const cats = Object.entries(byCat).filter(([k]) => k.split("|")[0] === g); if (!cats.length) return "";
        const sum = cats.reduce((t, [, v]) => t + v, 0);
        return `<tr><th colspan="2" style="padding-top:14px">${esc(g)}</th></tr>${cats.sort((a, b) => b[1] - a[1]).map(([k, v]) => `<tr><td>${esc(k.split("|")[1])}</td><td class="r">${RM(v)}</td></tr>`).join("")}<tr><td class="muted">Total ${esc(g.toLowerCase())}</td><td class="r muted">${RM(sum)}</td></tr>`;
      }).join("")}
      <tr><td><strong>Net income</strong></td><td class="r"><strong style="${yearIn - yearOut < 0 ? "color:var(--rust)" : ""}">${RM(yearIn - yearOut)}</strong></td></tr></table></div>`;
  $("#mon").onchange = e => { state.accMonth = e.target.value; render(); };
  $("#addExp").onclick = () => expenseForm(null);
  view.querySelectorAll("[data-exp]").forEach(r => r.onclick = () => expenseForm(mExps.find(e => e.id === Number(r.dataset.exp))));
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
      try { await q(sb.from("expenses").delete().eq("id", x.id)); closeSheet(); toast("Expense deleted"); render(); } catch (err) { fail(err); }
    };
  });
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
})();
