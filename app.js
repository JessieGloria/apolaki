/* Apolaki — stock, sales and accounts for Apolaki by Jason Labunda.
   Plain JavaScript, no build step. Data lives in Supabase. */
(() => {
const cfg = window.APOLAKI_CONFIG || {};
const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);

const state = {
  user: null, tab: "home",
  products: [], locations: [], stock: [],
  sellAt: localGet("sellAt", null), cart: {}, payment: "Cash", discount: 0,
  stockLoc: "all", search: ""
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
  if (bind) bind($("#sheetBody"));
  const f = $("#sheetBody").querySelector("input,select,textarea,button"); if (f) f.focus();
}
function closeSheet() {
  const sh = $("#sheet"); sh.classList.remove("open");
  clearTimeout(sheetTimer); sheetTimer = setTimeout(() => { sh.hidden = true; $("#sheetBody").innerHTML = ""; }, 320);
}
$("#sheet").addEventListener("click", e => { if (e.target.id === "sheet") closeSheet(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

const prod = sku => state.products.find(p => p.sku === sku);
const loc = id => state.locations.find(l => l.id === Number(id));
const workshop = () => state.locations.find(l => l.type === "workshop");
const retailers = () => state.locations.filter(l => l.type === "retailer");
const activeProducts = () => state.products.filter(p => p.status === "Active");
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
    const [p, l] = await Promise.all([
      q(sb.from("products").select("*").order("sku")),
      q(sb.from("locations").select("*").order("id"))
    ]);
    state.products = p; state.locations = l;
    localSet("products", p); localSet("locations", l);
    await loadStock();
  } catch (e) {
    state.products = localGet("products", []); state.locations = localGet("locations", []); state.stock = localGet("stock", []);
    toast("Offline. Showing the last saved copy.");
  }
}
async function loadStock() {
  try { state.stock = await q(sb.from("stock_levels").select("*")); localSet("stock", state.stock); }
  catch { state.stock = localGet("stock", []); }
}

/* ---------- auth ---------- */
function renderLogin(msg) {
  $("#tabs").hidden = true;
  $("#view").innerHTML = `
  <div class="login">
    <h1>Sign in</h1>
    <p class="muted">Use the email and password set up for Apolaki.</p>
    ${msg ? `<p class="tag rust" style="display:inline-block">${esc(msg)}</p>` : ""}
    <form id="loginForm">
      <label class="field"><span>Email</span><input name="email" type="email" autocomplete="username" required></label>
      <label class="field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>
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
  $("#tabs").hidden = false;
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
function go(tab) {
  state.tab = tab; render(); window.scrollTo(0, 0);
  const v = $("#view"); v.classList.remove("enter"); void v.offsetWidth; v.classList.add("enter");
}
document.querySelectorAll("#tabs button").forEach(b => b.onclick = () => go(b.dataset.tab));
function render() {
  document.querySelectorAll("#tabs button").forEach(b => b.setAttribute("aria-current", b.dataset.tab === state.tab ? "page" : "false"));
  ({ home: renderHome, market: renderSell, retailers: renderRetailers, stock: renderStock, accounts: renderAccounts })[state.tab]();
}

/* =========================================================
   HOME
   ========================================================= */
async function fetchHomeData() {
  const now = new Date(), ys = new Date(now.getFullYear(), 0, 1), ye = new Date(now.getFullYear() + 1, 0, 1);
  const [sales, pays, exps, unpaid] = await Promise.all([
    q(sb.from("sales").select("sold_at,amount,channel").neq("channel", "retailer").gte("sold_at", ys.toISOString()).lt("sold_at", ye.toISOString())),
    q(sb.from("payouts").select("paid_on,paid_amount,net_amount").eq("paid", true).gte("paid_on", ymd(ys)).lt("paid_on", ymd(ye))),
    q(sb.from("expenses").select("spent_on,amount").gte("spent_on", ymd(ys)).lt("spent_on", ymd(ye))),
    q(sb.from("payouts").select("*").eq("paid", false).order("period_month"))
  ]);
  return { year: now.getFullYear(), sales, pays, exps, unpaid };
}

async function renderHome() {
  const view = $("#view");
  const cached = localGet("homeData", null);
  if (cached) drawHome(cached); else view.innerHTML = `<h1>Overview</h1>${SKEL}`;
  try {
    const fresh = await fetchHomeData();
    if (JSON.stringify(fresh) !== JSON.stringify(cached)) { localSet("homeData", fresh); if (state.tab === "home") drawHome(fresh, true); }
  } catch { if (!cached) view.innerHTML = `<h1>Overview</h1><div class="card">You're offline. The Sell tab still works and syncs later.</div>`; }
}

function drawHome(d, quiet) {
  const view = $("#view"), now = new Date(), curM = ym(now), period = state.homePeriod || "month";
  const monthOf = s => ym(new Date(s.length === 10 ? s + "T00:00" : s));
  const inPeriod = s => period === "year" || monthOf(s) === curM;
  const months = Array.from({ length: 12 }, (_, i) => ym(new Date(d.year, i, 1)));
  const inc = Object.fromEntries(months.map(m => [m, 0]));
  const src = { Shops: 0, Markets: 0, Online: 0 };
  d.sales.forEach(s => { inc[monthOf(s.sold_at)] += Number(s.amount); if (inPeriod(s.sold_at)) src[s.channel === "online" ? "Online" : "Markets"] += Number(s.amount); });
  d.pays.forEach(p => { const a = Number(p.paid_amount ?? p.net_amount); inc[monthOf(p.paid_on)] += a; if (inPeriod(p.paid_on)) src.Shops += a; });
  const pending = outbox().reduce((t, r) => t + Number(r.amount), 0);
  src[outbox().some(r => r.channel === "online") ? "Online" : "Markets"] += pending; inc[curM] += pending;
  const moneyIn = Object.values(src).reduce((a, b) => a + b, 0);
  const spent = d.exps.filter(e => inPeriod(e.spent_on)).reduce((t, e) => t + Number(e.amount), 0);
  const due = d.unpaid.reduce((t, r) => t + Number(r.net_amount), 0);
  const shown = months.filter(m => m <= curM).slice(-8);
  const max = Math.max(1, ...shown.map(m => inc[m]));
  const pieces = stockTotalAt("all");

  const srcColors = { Shops: "var(--blue)", Markets: "var(--orange)", Online: "var(--purple)" };
  const C = 2 * Math.PI * 42; let off = 0;
  const arcs = Object.entries(src).filter(([, v]) => v > 0).map(([k, v]) => {
    const len = moneyIn ? C * v / moneyIn : 0, gap = Object.values(src).filter(x => x > 0).length > 1 ? 2.5 : 0;
    const a = `<circle cx="50" cy="50" r="42" fill="none" stroke="${srcColors[k]}" stroke-width="13" stroke-linecap="round" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}"/>`;
    off += len; return a;
  }).join("");

  const places = [workshop(), ...retailers(), ...state.locations.filter(l => l.type === "market" && l.active)].filter(Boolean);
  const placeColor = l => l.type === "workshop" ? "var(--teal)" : l.type === "retailer" ? "var(--blue)" : "var(--orange)";
  const placeIcon = l => l.type === "workshop" ? "tool" : l.type === "retailer" ? "shop" : "tent";
  const low = activeProducts().map(p => ({ p, n: stockAt("all", p.sku) })).filter(x => x.n <= 1).sort((a, b) => a.n - b.n);
  const label = period === "year" ? String(d.year) : now.toLocaleDateString("en-MY", { month: "long" });

  view.innerHTML = `
    <h1>Overview</h1>
    <div class="seg"><button data-p="month" aria-pressed="${period === "month"}">This month</button><button data-p="year" aria-pressed="${period === "year"}">This year</button></div>
    <div class="card">
      <div class="eyebrow">MONEY IN · ${esc(label.toUpperCase())}</div>
      <div class="num" style="font-size:32px;font-weight:700;margin-top:2px">${RM(moneyIn)}</div>
      <div class="bars">${shown.map((m, i) => `<div class="bar ${m === curM ? "now" : ""}"><i style="height:${Math.max(4, inc[m] / max * 100)}%;background:${COLORS[(i + months.indexOf(shown[0])) % 12]};animation-delay:${quiet ? 0 : i * 40}ms"></i><span>${monthStart(m).toLocaleDateString("en-MY", { month: "short" })}</span></div>`).join("")}</div>
    </div>
    <div class="list">
      <div class="row" data-go="accounts">${ico("in", "var(--green)")}<div class="grow"><div class="title">Money in</div><div class="sub">${label}</div></div><span class="value">${RM(moneyIn)}</span>${CHEV}</div>
      <div class="row" data-go="accounts">${ico("out", "var(--red)")}<div class="grow"><div class="title">Spent</div><div class="sub">${label}</div></div><span class="value">${RM(spent)}</span>${CHEV}</div>
      <div class="row" data-go="accounts">${ico("left", "var(--blue)")}<div class="grow"><div class="title">Left</div><div class="sub">${moneyIn - spent >= 0 ? "Money in minus spent" : "Spent more than came in"}</div></div><span class="value" style="${moneyIn - spent < 0 ? "color:var(--red)" : ""}">${RM(moneyIn - spent)}</span>${CHEV}</div>
      <div class="row" data-go="retailers">${ico("clock", "var(--orange)")}<div class="grow"><div class="title">Shop payouts due</div><div class="sub">${d.unpaid.length ? d.unpaid.map(u => monthStart(u.period_month.slice(0, 7)).toLocaleDateString("en-MY", { month: "short" })).join(", ") : "All paid"}</div></div><span class="value">${RM(due)}</span>${CHEV}</div>
      <div class="row" data-go="stock">${ico("box", "var(--purple)")}<div class="grow"><div class="title">Pieces in stock</div><div class="sub">${low.length ? `${low.length} running low` : "All stocked"}</div></div><span class="value">${pieces}</span>${CHEV}</div>
    </div>
    ${moneyIn ? `<h2>Where it came from</h2>
    <div class="card">
      <div class="donut-wrap"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="var(--card-2)" stroke-width="13"/>${arcs}</svg>
        <div class="donut-mid"><div class="eyebrow">${esc(label.toUpperCase())}</div><div class="value num">${RM(moneyIn)}</div></div></div>
      <div class="legend">${Object.entries(src).map(([k, v]) => `<div><b style="background:${srcColors[k]}"></b>${k}<span class="num">${RM(v)}</span></div>`).join("")}</div>
    </div>` : ""}
    <h2>Stock by place</h2>
    <div class="tiles">${places.map(l => { const n = stockTotalAt(l.id); return `<button class="ttile" data-place="${l.id}">${ico(placeIcon(l), placeColor(l), true)}<div class="name">${esc(l.name)}</div><div class="sub">${n} pieces</div><div class="meter"><i style="width:${pieces ? n / pieces * 100 : 0}%;background:${placeColor(l)}"></i></div><div class="sub small">${pieces ? Math.round(n / pieces * 100) : 0}% of stock</div></button>`; }).join("")}</div>
    ${low.length ? `<h2>Running low</h2><div class="list tight">${low.slice(0, 10).map(x => `<div class="row" data-sku="${x.p.sku}">${ico("warn", x.n <= 0 ? "var(--red)" : "var(--orange)")}<div class="grow"><div class="title">${esc(x.p.name)}</div><div class="sub">${x.p.sku}</div></div><span class="tag ${x.n <= 0 ? "rust" : "brass"}">${x.n <= 0 ? "Sold out" : "1 left"}</span></div>`).join("")}</div>` : ""}`;
  view.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { state.homePeriod = b.dataset.p; drawHome(d, true); });
  view.querySelectorAll("[data-go]").forEach(r => r.onclick = () => go(r.dataset.go));
  view.querySelectorAll("[data-place]").forEach(t => t.onclick = () => { state.stockLoc = Number(t.dataset.place); go("stock"); });
  view.querySelectorAll(".row[data-sku]").forEach(r => r.onclick = () => adjustSheet(prod(r.dataset.sku), workshop().id));
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
    view.innerHTML = `<h1>Sell</h1><div class="card"><h3>Start a market</h3><p class="muted">Create the market, bring stock from the workshop, then tap pieces to sell.</p><div class="btns"><button class="btn primary" id="newMarket">New market</button><button class="btn" id="goOnline">Record an online order</button></div></div>`;
    $("#newMarket").onclick = newMarketSheet;
    $("#goOnline").onclick = () => { state.sellAt = "online"; localSet("sellAt", "online"); render(); };
    return;
  }
  const s = state.search.toLowerCase();
  const items = activeProducts().filter(p => !s || p.name.toLowerCase().includes(s) || p.sku.toLowerCase().includes(s))
    .map(p => ({ p, left: stockAt(t.stockLoc, p.sku) })).sort((a, b) => (b.left > 0) - (a.left > 0) || a.p.sku.localeCompare(b.p.sku));
  const n = cartLines().reduce((x, l) => x + l.qty, 0);
  view.innerHTML = `<h1>Sell</h1>
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
        ${img ? `<img src="${img}" alt="" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'ph',textContent:'${p.sku}'}))">` : `<div class="ph">${p.sku}</div>`}
        ${inCart ? `<span class="count">${inCart}</span>` : ""}
        <div class="name">${esc(p.name)}</div>
        <div class="meta">${RM(p.retail_price)} · ${Math.max(0, left - inCart)} left</div></button>`;
    }).join("") || `<div class="empty">No pieces match.</div>`}</div>
    ${n ? `<div class="cartbar"><div><div>${n} piece${n > 1 ? "s" : ""}</div><div class="num" style="font-size:20px;font-weight:500">${RM(cartGross())}</div></div><button class="btn" id="review">Review sale</button></div>` : ""}`;
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
function renderRetailers() {
  const view = $("#view");
  view.innerHTML = `<h1>Retailers</h1>
    ${retailers().map(r => `<div class="card">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>${esc(r.name)}</h3><span class="tag">${esc(r.code || "")} · ${Math.round(Number(r.commission_rate) * 100)}%</span></div>
      <p class="muted small">${stockTotalAt(r.id)} pieces on their shelf</p>
      <div class="btns">
        <button class="btn" data-a="paste" data-id="${r.id}">Paste sales</button>
        <button class="btn" data-a="tally" data-id="${r.id}">Tally stock</button>
        <button class="btn" data-a="send" data-id="${r.id}">Send stock</button>
        <button class="btn" data-a="pay" data-id="${r.id}">Payouts</button>
      </div></div>`).join("")}
    <button class="btn block" id="addR">Add a retailer</button>`;
  view.querySelectorAll("[data-a]").forEach(b => b.onclick = () => {
    const r = loc(b.dataset.id);
    ({ paste: pasteSalesSheet, tally: tallySheet, pay: payoutsSheet, send: () => sendStockSheet(r) })[b.dataset.a](r);
  });
  $("#addR").onclick = () => openSheet(`
    <h2 style="margin-top:0">Add a retailer</h2>
    <form id="f"><label class="field"><span>Shop name</span><input name="name" required></label>
    <div class="two"><label class="field"><span>Short code</span><input name="code" required maxlength="6" placeholder="TAA"></label>
    <label class="field"><span>Commission %</span><input name="rate" type="number" step="0.1" min="0" max="100" value="35"></label></div>
    <button class="btn primary block">Add retailer</button></form>`, root => root.querySelector("#f").onsubmit = async e => {
      e.preventDefault(); const f = new FormData(e.target);
      try { const [r] = await q(sb.from("locations").insert({ name: f.get("name").trim(), type: "retailer", code: f.get("code").trim().toUpperCase(), commission_rate: (Number(f.get("rate")) || 0) / 100 }).select());
        state.locations.push(r); closeSheet(); toast("Retailer added"); render(); } catch (err) { fail(err); }
    });
}

/* reads lines like "APO055  2  154" or "APO055 TEXTURED EARRINGS 2 154.00" */
function parseLines(text, wantAmount) {
  const out = {}, errors = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim(); if (!line) continue;
    const m = line.match(/\b([A-Z]{2,5}\d{3})\b/i); if (!m) continue;
    const sku = m[1].toUpperCase();
    const nums = (line.slice(m.index + m[0].length).match(/-?\d[\d,]*(\.\d+)?/g) || []).map(s => Number(s.replace(/,/g, "")));
    if (!prod(sku)) { errors.push(`${sku} isn't in your product list`); continue; }
    if (!nums.length) { errors.push(`${sku}: no quantity found`); continue; }
    let qty, amount;
    if (wantAmount && nums.length >= 2) { qty = nums[nums.length - 2]; amount = nums[nums.length - 1]; }
    else { qty = nums[nums.length - 1]; amount = qty * Number(prod(sku).retail_price); }
    const o = out[sku] || (out[sku] = { sku, qty: 0, amount: 0 });
    o.qty += qty; o.amount = round2(o.amount + amount);
  }
  return { lines: Object.values(out), errors };
}

function pasteSalesSheet(r) {
  openSheet(`
    <h2 style="margin-top:0">${esc(r.name)} sales report</h2>
    <label class="field"><span>Sales month</span><input id="mon" type="month" value="${ym(new Date())}"></label>
    <label class="field"><span>Paste one line per piece: SKU, quantity, amount</span><textarea id="txt" placeholder="APO055	2	154&#10;APO057	2	138"></textarea></label>
    <button class="btn primary block" id="prev">Check report</button><div id="out"></div>`, root => {
    root.querySelector("#prev").onclick = async () => {
      const mon = root.querySelector("#mon").value, { lines, errors } = parseLines(root.querySelector("#txt").value, true);
      const reportId = `${r.code}-SALES-${mon}`;
      let existing = [];
      try { existing = await q(sb.from("sales").select("id").eq("report_id", reportId)); } catch {}
      const total = round2(lines.reduce((t, l) => t + l.amount, 0)), pcs = lines.reduce((t, l) => t + l.qty, 0);
      const comm = round2(total * Number(r.commission_rate));
      root.querySelector("#out").innerHTML = `
        ${errors.length ? `<div class="card" style="border-color:var(--rust)">${errors.map(esc).join("<br>")}</div>` : ""}
        <div class="scroll-x"><table class="simple"><tr><th>Piece</th><th class="r">Qty</th><th class="r">Amount</th></tr>
        ${lines.map(l => { const full = l.qty * Number(prod(l.sku).retail_price); return `<tr><td>${esc(prod(l.sku).name)}<div class="small muted">${l.sku}${l.amount < full ? ` · <span style="color:var(--brass)">below retail (${RM(full)})</span>` : ""}</div></td><td class="r">${l.qty}</td><td class="r">${RM(l.amount)}</td></tr>`; }).join("")}
        <tr><td><strong>${pcs} pieces</strong></td><td></td><td class="r"><strong>${RM(total)}</strong></td></tr>
        <tr><td class="muted">Commission ${Math.round(Number(r.commission_rate) * 100)}%</td><td></td><td class="r muted">−${RM(comm)}</td></tr>
        <tr><td>You receive</td><td></td><td class="r"><strong>${RM(total - comm)}</strong></td></tr></table></div>
        ${existing.length ? `<p class="tag brass" style="display:inline-block;margin-top:10px">${monthLabel(mon)} already has ${existing.length} lines saved. Saving replaces them with this report.</p>` : ""}
        ${lines.length ? `<button class="btn primary block" id="save" style="margin-top:10px">Save ${monthLabel(mon)} sales</button>` : ""}`;
      const s = root.querySelector("#save"); if (!s) return;
      s.onclick = async () => {
        const ms = monthStart(mon), last = new Date(ms.getFullYear(), ms.getMonth() + 1, 0, 12);
        try {
          if (existing.length) await q(sb.from("sales").delete().eq("report_id", reportId));
          await q(sb.from("sales").insert(lines.map(l => ({ sold_at: last.toISOString(), sale_month: mon + "-01", channel: "retailer", location_id: r.id, report_id: reportId, sku: l.sku, qty: l.qty, unit_price: Number(prod(l.sku).retail_price), amount: l.amount }))));
          await q(sb.from("payouts").upsert({ location_id: r.id, period_month: mon + "-01", sales_amount: total, commission: comm, net_amount: round2(total - comm) }, { onConflict: "location_id,period_month" }));
          await loadStock(); closeSheet(); toast(`${monthLabel(mon)} saved · ${pcs} pieces`); render();
        } catch (e) { fail(e); }
      };
    };
  });
}

function tallySheet(r) {
  openSheet(`
    <h2 style="margin-top:0">Tally ${esc(r.name)} stock</h2>
    <label class="field"><span>Paste the shop's stock balance: SKU and quantity per line</span><textarea id="txt" placeholder="APO042	4&#10;APO044	6"></textarea></label>
    <button class="btn primary block" id="go">Compare</button><div id="out"></div>`, root => root.querySelector("#go").onclick = () => {
      const { lines, errors } = parseLines(root.querySelector("#txt").value, false);
      const shop = Object.fromEntries(lines.map(l => [l.sku, l.qty]));
      const skus = new Set([...Object.keys(shop), ...state.products.filter(p => stockAt(r.id, p.sku) !== 0).map(p => p.sku)]);
      const diffs = [...skus].map(sku => ({ sku, app: stockAt(r.id, sku), shop: shop[sku] || 0 })).filter(d => d.app !== d.shop);
      const pcs = lines.reduce((t, l) => t + l.qty, 0);
      root.querySelector("#out").innerHTML = (errors.length ? `<div class="card">${errors.map(esc).join("<br>")}</div>` : "") + (diffs.length ? `
        <h3 style="margin-top:14px">${diffs.length} don't match</h3>
        <table class="simple"><tr><th>Piece</th><th class="r">App</th><th class="r">Shop</th></tr>${diffs.map(d => `<tr><td>${esc(prod(d.sku)?.name)}<div class="small muted">${d.sku}</div></td><td class="r">${d.app}</td><td class="r">${d.shop}</td></tr>`).join("")}</table>
        <p class="small muted">Check for a missing sales report or restock first. If the shop's count is right, accept it.</p>
        <button class="btn block" id="accept">Use the shop's counts</button>`
        : `<div class="card" style="margin-top:12px"><h3>Everything matches</h3><p class="muted">${lines.length} items, ${pcs} pieces.</p></div>`);
      const a = root.querySelector("#accept"); if (a) a.onclick = async () => {
        const rows = diffs.map(d => d.shop > d.app ? { sku: d.sku, qty: d.shop - d.app, to_location: r.id, reason: "correction", notes: "Shop stock tally" } : { sku: d.sku, qty: d.app - d.shop, from_location: r.id, reason: "correction", notes: "Shop stock tally" });
        try { await q(sb.from("stock_movements").insert(rows)); await loadStock(); closeSheet(); toast("Counts updated"); render(); } catch (e) { fail(e); }
      };
    });
}

function sendStockSheet(r) {
  openSheet(`
    <h2 style="margin-top:0">Send stock to ${esc(r.name)}</h2>
    <div class="chips"><button class="chip" data-src="new" aria-pressed="true">Newly made pieces</button><button class="chip" data-src="ws" aria-pressed="false">From workshop stock</button></div>
    <div class="two"><label class="field"><span>Date</span><input id="d" type="date" value="${ymd(new Date())}"></label>
    <label class="field"><span>Restock ID</span><input id="ref" value="${new Date().toLocaleDateString("en-MY", { month: "short" }).toUpperCase()}-01"></label></div>
    <label class="field"><span>Paste SKU and quantity per line</span><textarea id="txt" placeholder="APO042	4&#10;APO086	3"></textarea></label>
    <button class="btn primary block" id="go">Save delivery</button>`, root => {
    let src = "new";
    root.querySelectorAll("[data-src]").forEach(b => b.onclick = () => { src = b.dataset.src; root.querySelectorAll("[data-src]").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    root.querySelector("#go").onclick = async () => {
      const { lines, errors } = parseLines(root.querySelector("#txt").value, false);
      if (errors.length) return toast(errors[0]);
      if (!lines.length) return toast("Paste at least one SKU and quantity");
      const ws = workshop().id;
      try {
        await q(sb.from("stock_movements").insert(lines.map(l => ({ moved_on: root.querySelector("#d").value, sku: l.sku, qty: l.qty, to_location: r.id, from_location: src === "ws" ? ws : null, reason: src === "ws" ? "transfer" : "restock", ref: root.querySelector("#ref").value || null }))));
        await loadStock(); closeSheet(); toast(`${lines.reduce((t, l) => t + l.qty, 0)} pieces sent to ${r.name}`); render();
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
    .filter(x => (x.p.status === "Active" || x.n !== 0) && (!s || x.p.name.toLowerCase().includes(s) || x.p.sku.toLowerCase().includes(s)));
  view.innerHTML = `<h1>Stock</h1>
    <div class="chips"><button class="chip" data-l="all" aria-pressed="${L === "all"}">All places · ${stockTotalAt("all")}</button>
    ${places.map(l => `<button class="chip" data-l="${l.id}" aria-pressed="${String(L) === String(l.id)}">${esc(l.name)} · ${stockTotalAt(l.id)}</button>`).join("")}</div>
    <div class="btns"><button class="btn" id="add">Add new pieces</button><button class="btn" id="move">Move stock</button><button class="btn" id="products">Products</button></div>
    <input class="search" id="search" type="search" placeholder="Search pieces" value="${esc(state.search)}">
    <div class="list tight">${rows.map(({ p, n }) => {
      const where = L === "all" ? places.map(l => [l, stockAt(l.id, p.sku)]).filter(([, k]) => k).map(([l, k]) => `${esc(l.name)} ${k}`).join(" · ") : "";
      return `<div class="row" data-sku="${p.sku}"><div class="grow"><div class="title">${esc(p.name)}</div><div class="small muted">${p.sku}${p.status !== "Active" ? " · " + esc(p.status) : ""}${where ? " · " + where : ""}</div></div>
        <span class="num" style="font-size:18px;${n <= 0 ? "color:var(--rust)" : ""}">${n}</span></div>`;
    }).join("") || `<div class="empty">Nothing here.</div>`}</div>
    <p class="small muted">Tap a piece to adjust its count.</p>`;
  view.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { state.stockLoc = b.dataset.l === "all" ? "all" : Number(b.dataset.l); render(); });
  $("#search").oninput = e => { state.search = e.target.value; const pos = e.target.selectionStart; render(); const i = $("#search"); i.focus(); i.setSelectionRange(pos, pos); };
  $("#add").onclick = () => moveSheet({ to: L === "all" ? workshop().id : L, from: null, title: "Add new pieces", restock: true });
  $("#move").onclick = () => moveSheet({ from: workshop().id, to: retailers()[0]?.id, title: "Move stock" });
  $("#products").onclick = productsSheet;
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
    <div class="list tight" id="pick">${list.map(p => `<div class="row"><div class="grow"><div class="title small">${esc(p.name)}</div><div class="small muted" data-have="${p.sku}"></div></div>
      <input type="number" inputmode="numeric" min="0" step="1" data-sku="${p.sku}" style="width:80px" placeholder="0"></div>`).join("")}</div>
    <button class="btn primary block" id="go">Save</button>`, root => {
    const showHave = () => { const f = root.querySelector("#from").value; root.querySelectorAll("[data-have]").forEach(e => e.textContent = f ? `${stockAt(Number(f), e.dataset.have)} at source` : e.dataset.have); };
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
    <p class="muted small">${p.sku} · ${RM(p.retail_price)}</p>
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
  openSheet(`
    <h2 style="margin-top:0">Products</h2>
    <button class="btn primary block" id="new">Add a product</button>
    <div class="list tight" style="margin-top:12px">${state.products.map(p => `<div class="row" data-sku="${p.sku}"><div class="grow"><div class="title">${esc(p.name)}</div><div class="small muted">${p.sku} · ${esc(p.category || "")} · ${esc(p.status)}</div></div><span class="num">${RM(p.retail_price)}</span></div>`).join("")}</div>`, root => {
    root.querySelector("#new").onclick = () => productForm(null);
    root.querySelectorAll("[data-sku]").forEach(r => r.onclick = () => productForm(prod(r.dataset.sku)));
  });
}
function productForm(p) {
  const next = "APO" + String(Math.max(0, ...state.products.map(x => parseInt(x.sku.replace(/\D/g, ""), 10) || 0)) + 1).padStart(3, "0");
  const v = p || { sku: next, status: "Active" };
  const field = (k, label, type = "text") => `<label class="field"><span>${label}</span><input name="${k}" type="${type}" ${type === "number" ? 'step="0.01"' : ""} value="${esc(v[k] ?? "")}"></label>`;
  openSheet(`
    <h2 style="margin-top:0">${p ? "Edit product" : "New product"}</h2>
    <form id="f">
      <div class="two">${field("sku", "SKU")}${field("retail_price", "Retail price (RM)", "number")}</div>
      ${field("name", "Product name")}
      <div class="two">${field("category", "Category")}${field("size", "Size")}</div>
      <div class="two">${field("family", "Product family")}${field("collection", "Collection")}</div>
      <label class="field"><span>Status</span><select name="status">${["Active", "Paused", "Replaced", "Discontinued"].map(s => `<option ${v.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      ${field("replacement_sku", "Replaced by SKU")}
      ${field("photo", "Google Drive photo ID")}
      ${field("notes", "Notes")}
      <button class="btn primary block">Save product</button>
    </form>`, root => root.querySelector("#f").onsubmit = async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      for (const k in f) if (f[k] === "") f[k] = null;
      f.sku = (f.sku || "").trim().toUpperCase(); f.retail_price = Number(f.retail_price) || 0;
      if (!f.sku || !f.name) return toast("SKU and name are needed");
      try {
        if (p) await q(sb.from("products").update(f).eq("sku", p.sku)); else await q(sb.from("products").insert(f));
        await loadAll(); closeSheet(); toast("Product saved"); render();
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
  if (!view.querySelector("#mon")) view.innerHTML = `<h1>Accounts</h1>${SKEL}`;
  let sales, pays, exps;
  try {
    [sales, pays, exps] = await Promise.all([
      q(sb.from("sales").select("sold_at,amount,channel,location_id,payment_method").neq("channel", "retailer").gte("sold_at", ys.toISOString()).lt("sold_at", ye.toISOString())),
      q(sb.from("payouts").select("*").eq("paid", true).gte("paid_on", ymd(ys)).lt("paid_on", ymd(ye))),
      q(sb.from("expenses").select("*").gte("spent_on", ymd(ys)).lt("spent_on", ymd(ye)).order("spent_on", { ascending: false }))
    ]);
  } catch { view.innerHTML = `<h1>Accounts</h1><div class="card">You're offline. Accounts need a connection.</div>`; return; }

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

  view.innerHTML = `<h1>Accounts</h1>
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
