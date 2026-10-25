const CACHE = "apolaki-v37";

const SHELL = ["./", "index.html", "styles.css", "app.js", "config.js", "icon.svg", "notify-icon.png", "manifest.webmanifest",
  "photos/1-omShRGJ91V0S5Vaneau30ZpUs8TTnLn.jpg", "photos/11kL_nYQ0OerVn2zxx4206O4Q_u4rF_Em.jpg", "photos/1BSilJ9CiyTly-nx_q1Bgrf01tKvZNXb-.jpg", "photos/1D3qTTirflmU9S8i2vxWCBbFw1rx3yYgE.jpg", "photos/1FWZ1XQfxf7m-HmfAFY9lAq4Xzq1WdRuc.jpg", "photos/1NxPyuOafO_MMs-W_R1S4xdDoemsDOJYm.jpg", "photos/1VWIQeptxiU3vBLeCbFPnKq-O2mgkW5OR.jpg", "photos/1Ze6qtO-80U40qXjl1PknrNDDW4DtTejy.jpg", "photos/1cStgshmph1BBE-DgtpHeSsTaeDuBPW23.jpg", "photos/1cYsskZpLKPflc8bbyKwRS3HjMzvYm6Gp.jpg", "photos/1eG7TjSzd_dPgdw0ZzvqEdHUVLorYNvIR.jpg", "photos/1f-Oi7Z7_FquS0JMfliVW4H-GrAsiyfzl.jpg", "photos/1ibQz-8RSCe1A6RRKxth4X9-Mj9xPuOPH.jpg", "photos/1livCCEUAfHNwy_Ap71V96cbuy73VKRPI.jpg", "photos/1lwkhynMPJqh00VxoxKbfu8kmdRbHB4Kh.jpg", "photos/1qp45finekXtGD64c16QSJFU26qWet0dx.jpg", "photos/1rsFDnM86VJZIbpfFCf4hHnVPclBO9CFu.jpg",
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.hostname.endsWith("supabase.co")) return;
  e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; })
    .catch(() => caches.match(e.request, { ignoreSearch: e.request.mode === "navigate" })));
});

/* phone notifications for new shop orders (sent by the notify-new-order function) */
self.addEventListener("push", e => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(m.title || "Apolaki", { body: m.body || "", tag: m.tag, renotify: !!m.tag, icon: "notify-icon.png", badge: "notify-icon.png", data: { open: m.open } }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const open = e.notification.data && e.notification.data.open;
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    const w = ws[0];
    if (w) { if (open) w.postMessage({ open }); return w.focus(); }
    return clients.openWindow(open ? "./?open=" + encodeURIComponent(open) : "./");
  }));
});
