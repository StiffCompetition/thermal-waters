/* Thermal Waters of the World: test build.
   Everything a visitor adds is saved on their own device (Store below).
   Store is the single place that touches storage, so a shared database can replace it later. */
"use strict";

const CONFIG = {
  confirmThreshold: 1,          // votes needed before a suggested correction shows (the proposer counts as one; test build = 1, launch = 2)
  maxPhotoPx: 1000,
  tiles: {
    topo: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}", attr: "Map tiles &copy; Esri" },
    sat:  { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attr: "Map tiles &copy; Esri" }
  }
};

const CATS = [
  { id: 1, name: "Properly Wild", line: "Hike in, no facilities, bring your own towel and nerve.", color: "#2e7d32" },
  { id: 2, name: "Roadside Dip", line: "Free, easy to reach, nothing but the water.", color: "#7cb342" },
  { id: 3, name: "Mum Could Walk It", line: "Short stroll, tidy path, maybe a bench and a bin.", color: "#f9a825" },
  { id: 4, name: "Towel Provided", line: "Paid entry, changing rooms, a cafe nearby.", color: "#ef6c00" },
  { id: 5, name: "Robe and Slippers", line: "Hotel or resort level, with a hot chocolate waiting.", color: "#8e24aa" }
];
const NOCAT = { id: 0, name: "Not yet classified", line: "Nobody has placed this one on the scale yet. Be the first.", color: "#78909c" };
const catOf = id => CATS.find(c => c.id === Number(id)) || NOCAT;

const CRITERIA = [
  { id: "clean", label: "Cleanliness", help: "Water, changing area, surroundings", na: false },
  { id: "staff", label: "Staff", help: "Friendliness and help. Tick not applicable if unstaffed.", na: true },
  { id: "cost", label: "Cost", help: "Value for money. 5 is free or great value.", na: false },
  { id: "access", label: "Getting there", help: "Walking, public transport, road access", na: false },
  { id: "worth", label: "Worth the trip", help: "Overall: would you go again?", na: false }
];

const PHOTO_TERMS = "By choosing Professional-style you confirm you took the photo (or hold the rights), you keep your copyright, and you allow Thermal Waters of the World to show it on this site and to use it in the planned Thermal Waters of the World book, with your first name or handle as the credit. Holiday snaps are shown on the site only, as everyday reference. You can remove your photos at any time. (Draft wording for the test build.)";

/* ---------- storage ---------- */
const Store = {
  get(k, d) { try { const v = localStorage.getItem("tw_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem("tw_" + k, JSON.stringify(v)); return true; } catch (e) { return false; } }
};

const uid = () => { const a = new Uint32Array(3); crypto.getRandomValues(a); return Array.from(a, n => n.toString(36)).join(""); };
function profile() {
  let p = Store.get("profile", null);
  if (!p) { p = { id: uid(), handle: "Soaker-" + Math.floor(1000 + Math.random() * 9000), joined: new Date().toISOString() }; Store.set("profile", p); }
  return p;
}

/* ---------- state ---------- */
const S = {
  springs: [], byId: new Map(), notes: {},
  reviews: Store.get("reviews", []), photos: Store.get("photos", []), lists: Store.get("lists", { been: [], want: [] }),
  edits: Store.get("edits", []), added: Store.get("added", []), listings: Store.get("listings", []), cats: Store.get("cats", []),
  f: { q: "", cats: new Set(), country: "", temp: "", minRating: 0, photos: false, mine: "" },
  view: "map", map: null, cluster: null, layer: "topo", userPos: null
};
/* ---------- shared database (Supabase) ----------
   Everything visitors add is stored in one shared table, so every visitor sees the same
   ratings, photos, corrections, listings and added springs. The key below is the public
   (anon) key: row-level security in supabase/schema.sql decides what anyone may do.
   If the database cannot be reached the site falls back to this device only. */
const SHARED = ["reviews", "photos", "edits", "listings", "cats", "added", "lists"];
const Cloud = {
  url: "https://fbchngfatwtjwttohhoe.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiY2huZ2ZhdHd0and0dG9oaG9lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUzMDE5NjksImV4cCI6MjExMDg3Nzk2OX0.9WJQk4Xb8AVwziD3M6kbww3CNdkES3RzvIk7umgPQGg",
  on: false, ses: null, mine: {}, q: Promise.resolve(),
  async token() {
    let s = this.ses || Store.get("ses", null);
    const now = Math.floor(Date.now() / 1000);
    if (s && s.expires_at - 60 > now) { this.ses = s; return s.access_token; }
    let r;
    if (s && s.refresh_token) r = await fetch(this.url + "/auth/v1/token?grant_type=refresh_token", { method: "POST", headers: { apikey: this.key, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    if (!r || !r.ok) r = await fetch(this.url + "/auth/v1/signup", { method: "POST", headers: { apikey: this.key, "Content-Type": "application/json" }, body: "{}" });
    if (!r.ok) throw new Error("auth");
    s = await r.json(); this.ses = s; Store.set("ses", s); return s.access_token;
  },
  async call(path, o = {}) {
    const t = await this.token();
    const r = await fetch(this.url + path, Object.assign({}, o, { headers: Object.assign({ apikey: this.key, Authorization: "Bearer " + t, "Content-Type": "application/json" }, o.headers || {}) }));
    if (!r.ok) throw new Error(path + " " + r.status);
    return r;
  },
  uid() { return this.ses.user.id; },
  /* what this visitor owns, as rows */
  rows(k) {
    const me = this.uid(), out = new Map();
    const put = (kind, id, spring, doc) => out.set(kind + "/" + id, { kind, id, spring, doc });
    if (k === "reviews") S.reviews.filter(r => r.user === me).forEach(r => put("review", r.spring + "|" + me, r.spring, r));
    if (k === "photos") S.photos.filter(p => p.user === me && !String(p.data).startsWith("data:")).forEach(p => put("photo", p.id, p.spring, p));
    if (k === "edits") S.edits.forEach(e => {
      if (e.user === me) { const d = Object.assign({}, e, { confirm: [] }); delete d.verdict; put("edit", e.id, e.spring, d); }
      if ((e.confirm || []).includes(me) && e.user !== me) put("confirm", e.id + "|" + me, e.spring, { edit: e.id });
    });
    if (k === "listings") S.listings.filter(l => l.user === me).forEach(l => put("listing", l.id, l.spring, l));
    if (k === "cats") S.cats.filter(c => c.user === me).forEach(c => put("cat", c.spring + "|" + me, c.spring, c));
    if (k === "added") S.added.filter(a => a.user === me).forEach(a => put("added", a.id, a.id, a));
    if (k === "lists") ["been", "want"].forEach(w => S.lists[w].forEach(id => put("list", me + "|" + w + "|" + id, id, { kind: w, spring: id })));
    return out;
  },
  kinds: { reviews: ["review"], photos: ["photo"], edits: ["edit", "confirm"], listings: ["listing"], cats: ["cat"], added: ["added"], lists: ["list"] },
  async uploadPhotos() {
    const me = this.uid();
    for (const p of S.photos.filter(p => p.user === me && String(p.data).startsWith("data:"))) {
      p.id = p.id || uid();
      const blob = await (await fetch(p.data)).blob();
      await this.call("/storage/v1/object/photos/" + me + "/" + p.id + ".jpg", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      p.data = this.url + "/storage/v1/object/public/photos/" + me + "/" + p.id + ".jpg";
    }
  },
  async sync(k) {
    if (k === "photos") await this.uploadPhotos();
    const want = this.rows(k), kinds = this.kinds[k], up = [];
    want.forEach((row, key) => { const j = JSON.stringify(row.doc); if (this.mine[key] !== j) { up.push(row); this.mine[key] = j; } });
    const gone = Object.keys(this.mine).filter(key => kinds.includes(key.split("/")[0]) && !want.has(key));
    if (up.length) await this.call("/rest/v1/items?on_conflict=kind,id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(up) });
    for (const key of gone) { const i = key.indexOf("/"); await this.call("/rest/v1/items?kind=eq." + key.slice(0, i) + "&id=eq." + encodeURIComponent(key.slice(i + 1)), { method: "DELETE" }); delete this.mine[key]; }
  },
  push(k) {
    this.q = this.q.then(() => this.sync(k)).catch(() => toast("Could not reach the shared database. Try again in a moment."));
  },
  async pull() {
    const me = this.uid(), rows = [];
    for (let off = 0; ; off += 1000) {
      const r = await this.call("/rest/v1/items?select=kind,id,spring,user_id,doc&order=created_at.asc&limit=1000&offset=" + off);
      const part = await r.json(); rows.push(...part); if (part.length < 1000) break;
    }
    const n = { reviews: [], photos: [], edits: [], listings: [], cats: [], added: [], lists: { been: [], want: [] } }, conf = {}, verd = {};
    this.mine = {};
    rows.forEach(x => {
      if (x.user_id === me) this.mine[x.kind + "/" + x.id] = JSON.stringify(x.doc);
      const d = Object.assign({}, x.doc, x.kind === "confirm" || x.kind === "list" || x.kind === "verdict" ? {} : { user: x.user_id });
      if (x.kind === "review") n.reviews.push(d);
      else if (x.kind === "photo") n.photos.push(d);
      else if (x.kind === "edit") n.edits.push(d);
      else if (x.kind === "verdict") verd[x.doc.edit] = x.doc;
      else if (x.kind === "confirm") (conf[x.doc.edit] = conf[x.doc.edit] || []).push(x.user_id);
      else if (x.kind === "listing") n.listings.push(d);
      else if (x.kind === "cat") n.cats.push(d);
      else if (x.kind === "added") n.added.push(d);
      else if (x.kind === "list" && x.user_id === me) (n.lists[x.doc.kind] || []).push(x.doc.spring);
    });
    n.edits.forEach(e => { e.confirm = conf[e.id] || []; if (verd[e.id]) e.verdict = verd[e.id]; });
    SHARED.forEach(k => S[k] = n[k]);
  },
  async init() {
    try {
      await this.token();
      const me = this.uid(), p = profile();
      const old = p.id;
      if (old !== me) {   // first time on the shared database: carry this device's test data over
        p.id = me; Store.set("profile", p);
        ["reviews", "photos", "edits", "listings", "cats", "added"].forEach(k => S[k].forEach(x => { if (x.user === old) x.user = me; }));
        S.edits.forEach(e => e.confirm = (e.confirm || []).map(u => u === old ? me : u));
      }
      this.on = true;
      if (!Store.get("cloud1", false)) { for (const k of SHARED) await this.sync(k); Store.set("cloud1", true); }
      await this.pull();
    } catch (e) { this.on = false; console.warn("Shared database unavailable, using this device only", e); }
  },
  async eraseMine() {
    const me = this.uid();
    const ph = S.photos.filter(p => p.user === me && String(p.data).includes("/photos/" + me + "/")).map(p => me + "/" + p.id + ".jpg");
    if (ph.length) await this.call("/storage/v1/object/photos", { method: "DELETE", body: JSON.stringify({ prefixes: ph }) });
    await this.call("/rest/v1/items?user_id=eq." + me, { method: "DELETE" });
  }
};
const save = k => {
  if (Cloud.on && SHARED.includes(k)) { Cloud.push(k); return true; }
  return Store.set(k, S[k]);
};

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => Number(n).toLocaleString("en-GB");
function toast(t) { const el = $("#toast"); el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => el.hidden = true, 2600); }
function km(a, b) { const R = 6371, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); }
function tempClass(t) { if (t == null) return ""; if (t < 20) return "Cold"; if (t < 37) return "Warm"; if (t < 45) return "Hot"; return "Very hot"; }
const stars = n => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));

/* ---------- data model ---------- */
const isApprox = s => !s.posConfirmed && String(s.src || "").startsWith("Editorial");
const LOC_HOW = { gps: "I stood there and used GPS", sat: "I can see it on satellite imagery", local: "Local knowledge (I live nearby or visited)", sign: "An official sign, website or map" };
function applyEdits(s) {
  const o = Object.assign({}, s);
  const mine = S.edits.filter(e => e.spring === s.id && !e.rejected && !(e.verdict && e.verdict.verdict === "rejected"));
  const best = {};
  mine.forEach(e => { if (e.field === "position") { if (e.verdict && e.verdict.verdict === "verified") { try { const p = JSON.parse(e.value); if (!best.position || e.date > best.position.e.date) best.position = { v: 9, e, p }; } catch (x) { } } return; }
    const v = 1 + (e.confirm || []).length; if (v >= CONFIG.confirmThreshold && (!best[e.field] || v >= best[e.field].v)) best[e.field] = { v, e }; });
  Object.keys(best).forEach(f => {
    if (f === "position") { o.lat = best.position.p.lat; o.lon = best.position.p.lon; o.posConfirmed = true; return; }
    const val = best[f].e.value;
    if (f === "temp_c") o.temp_c = Number(val);
    else if (f === "name") o.name = val;
    else if (f === "closed") o.closed = true;
    else if (f === "access") o.accessNote = val;
    else if (f === "cost") o.costNote = val;
  });
  const votes = S.cats.filter(c => c.spring === s.id);
  if (votes.length) { const tally = {}; votes.forEach(v => tally[v.cat] = (tally[v.cat] || 0) + 1); o.cat = Number(Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0]); }
  return o;
}
function rebuild() {
  const all = S.springs_base.concat(S.added.map(a => Object.assign({ src: "Community", userAdded: true }, a)));
  S.springs = all.map(applyEdits);
  S.byId = new Map(S.springs.map(s => [s.id, s]));
  S.agg = new Map();
  S.reviews.forEach(r => { const a = S.agg.get(r.spring) || { n: 0, sum: {}, cnt: {} };
    a.n++; CRITERIA.forEach(c => { const v = r.r[c.id]; if (v) { a.sum[c.id] = (a.sum[c.id] || 0) + v; a.cnt[c.id] = (a.cnt[c.id] || 0) + 1; } }); S.agg.set(r.spring, a); });
  S.photoCount = new Map(); S.photos.forEach(p => S.photoCount.set(p.spring, (S.photoCount.get(p.spring) || 0) + 1));
}
function rating(id) {
  const a = S.agg.get(id); if (!a) return null;
  const per = {}; let tot = 0, k = 0;
  CRITERIA.forEach(c => { if (a.cnt[c.id]) { per[c.id] = a.sum[c.id] / a.cnt[c.id]; tot += per[c.id]; k++; } });
  return { n: a.n, per, overall: k ? tot / k : null };
}

/* ---------- filters ---------- */
function passes(s) {
  const f = S.f;
  if (f.q) { const q = f.q.toLowerCase(); if (!(s.name.toLowerCase().includes(q) || (s.alt || "").toLowerCase().includes(q) || (s.country || "").toLowerCase().includes(q) || (s.region || "").toLowerCase().includes(q))) return false; }
  if (f.cats.size && !f.cats.has(s.cat || 0)) return false;
  if (f.country && s.country !== f.country) return false;
  if (f.temp) { const t = tempClass(s.temp_c); if (t !== f.temp) return false; }
  if (f.minRating) { const r = rating(s.id); if (!r || r.overall < f.minRating) return false; }
  if (f.photos && !S.photoCount.get(s.id)) return false;
  if (f.mine) { const l = S.lists[f.mine] || []; if (!l.includes(s.id)) return false; }
  return true;
}
const activeFilters = () => (S.f.cats.size ? 1 : 0) + (S.f.country ? 1 : 0) + (S.f.temp ? 1 : 0) + (S.f.minRating ? 1 : 0) + (S.f.photos ? 1 : 0) + (S.f.mine ? 1 : 0);

/* ---------- map ---------- */
function initMap() {
  const map = L.map("map", { worldCopyJump: true, minZoom: 2, zoomControl: false }).setView([30, 10], 2);
  S.map = map; L.control.zoom({ position: "bottomright" }).addTo(map);
  S.tileLayer = L.tileLayer(CONFIG.tiles.topo.url, { attribution: CONFIG.tiles.topo.attr, maxZoom: 17 }).addTo(map);
  S.cluster = L.markerClusterGroup({ chunkedLoading: true, maxClusterRadius: 45, showCoverageOnHover: false });
  map.addLayer(S.cluster);
  map.on("moveend", () => { clearTimeout(initMap.t); initMap.t = setTimeout(renderList, 150); });
  $("#btnLayer").onclick = () => {
    S.layer = S.layer === "topo" ? "sat" : "topo";
    S.tileLayer.setUrl(CONFIG.tiles[S.layer].url);
    $("#btnLayer").textContent = S.layer === "topo" ? "Satellite" : "Map";
  };
  $("#btnNear").onclick = locate;
  $("#btnFilters").onclick = openFilters;
  $("#btnAdd").onclick = () => openAdd();
}
function popupHtml(s) {
  const c = catOf(s.cat), r = rating(s.id);
  return `<div class="pop"><b>${esc(s.name)}</b><small>${esc([s.region, s.country].filter(Boolean).join(", "))}</small><br>
    <span class="chip"><i style="background:${c.color}"></i>${esc(c.name)}</span>${r ? ` <span class="stars">${stars(r.overall)}</span>` : ""}<br>${isApprox(s) ? `<span class="tag warn">Approximate position</span><br>` : ""}
    <button class="btn sm" data-open="${esc(s.id)}">Open</button></div>`;
}
function refreshMarkers() {
  S.cluster.clearLayers();
  const ms = [];
  S.springs.forEach(s => {
    if (!passes(s)) return;
    const ap = isApprox(s);
    const m = L.circleMarker([s.lat, s.lon], ap ? { radius: 10, weight: 2, color: "#d97706", dashArray: "3 3", fillColor: catOf(s.cat).color, fillOpacity: .35 } : { radius: 7, weight: 2, color: "#fff", fillColor: catOf(s.cat).color, fillOpacity: .95 });
    m.bindPopup(() => popupHtml(s));
    m.on("click", () => { /* popup opens */ });
    ms.push(m);
  });
  S.cluster.addLayers(ms);
  $("#statline").textContent = `${fmt(ms.length)} springs shown of ${fmt(S.springs.length)}`;
  const n = activeFilters(); const b = $("#fcount"); b.hidden = !n; b.textContent = n;
  renderList();
}
function renderList() {
  if (!S.map) return;
  const b = S.map.getBounds(), c = S.map.getCenter();
  let arr = S.springs.filter(s => passes(s) && b.contains([s.lat, s.lon]));
  const total = arr.length, sort = $("#sortSel").value;
  const here = S.userPos || { lat: c.lat, lon: c.lng };
  if (sort === "name") arr.sort((a, z) => a.name.localeCompare(z.name));
  else if (sort === "near") arr.sort((a, z) => km(here, a) - km(here, z));
  else if (sort === "temp") arr.sort((a, z) => (z.temp_c ?? -99) - (a.temp_c ?? -99));
  else arr.sort((a, z) => ((rating(z.id)?.overall ?? 0) - (rating(a.id)?.overall ?? 0)) || ((S.photoCount.get(z.id) || 0) - (S.photoCount.get(a.id) || 0)) || a.name.localeCompare(z.name));
  arr = arr.slice(0, 60);
  $("#listTitle").textContent = `${fmt(total)} in view`;
  $("#list").innerHTML = arr.length ? arr.map(itemHtml).join("") : `<div class="item"><span class="muted">Nothing here with these filters. Zoom out or clear the filters.</span></div>`;
}
function itemHtml(s) {
  const c = catOf(s.cat), r = rating(s.id);
  return `<div class="item" data-open="${esc(s.id)}"><span class="dot" style="background:${c.color}"></span>
    <div><b>${esc(s.name)}</b><small>${esc([s.region, s.country].filter(Boolean).join(", "))}${s.temp_c != null ? " · " + s.temp_c + "°C" : ""} · ${esc(c.name)}${isApprox(s) ? " · <span class=\"warntxt\">approximate position</span>" : ""}</small></div>
    <span class="score">${r ? r.overall.toFixed(1) + " ★" : ""}</span></div>`;
}
function locate() {
  if (!navigator.geolocation) return toast("Location is not available here");
  toast("Finding you…");
  navigator.geolocation.getCurrentPosition(p => {
    S.userPos = { lat: p.coords.latitude, lon: p.coords.longitude };
    S.map.setView([S.userPos.lat, S.userPos.lon], 8);
    $("#sortSel").value = "near"; renderList();
  }, () => toast("Could not get your location"), { timeout: 10000 });
}
function flyTo(s, z = 12) { setView("map"); S.map.setView([s.lat, s.lon], z); }

/* ---------- sheet ---------- */
function openSheet(title, html, onReady) {
  const sh = $("#sheet");
  sh.innerHTML = `<div class="sh"><b>${esc(title)}</b><button class="x" aria-label="Close" data-close>✕</button></div><div class="sb">${html}</div>`;
  sh.hidden = false; $("#scrim").hidden = false; sh.scrollTop = 0;
  if (onReady) onReady(sh);
}
function closeSheet() { $("#sheet").hidden = true; $("#scrim").hidden = true; if (location.hash.startsWith("#spring=")) history.replaceState(null, "", "#" + S.view); }

function openFilters() {
  const countries = Array.from(new Set(S.springs.map(s => s.country).filter(Boolean))).sort();
  openSheet("Filters", `
    <div class="field"><span>Category</span><div class="row" id="fcats">${[NOCAT].concat(CATS).map(c => `<button class="chip btn ${S.f.cats.has(c.id) ? "on" : ""}" data-fc="${c.id}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`).join("")}</div></div>
    <label class="field"><span>Country</span><select id="fCountry"><option value="">All countries</option>${countries.map(c => `<option ${S.f.country === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
    <label class="field"><span>Water temperature</span><select id="fTemp">${["", "Cold", "Warm", "Hot", "Very hot"].map(t => `<option value="${t}" ${S.f.temp === t ? "selected" : ""}>${t || "Any"}${t === "Cold" ? " (under 20°C)" : t === "Warm" ? " (20 to 36°C)" : t === "Hot" ? " (37 to 44°C)" : t === "Very hot" ? " (45°C and over)" : ""}</option>`).join("")}</select></label>
    <label class="field"><span>Minimum rating</span><select id="fRate">${[0, 3, 3.5, 4, 4.5].map(n => `<option value="${n}" ${S.f.minRating === n ? "selected" : ""}>${n ? n + " stars and up" : "Any"}</option>`).join("")}</select></label>
    <label class="field"><span><input type="checkbox" id="fPhotos" ${S.f.photos ? "checked" : ""} style="width:auto"> Has photos</span></label>
    <label class="field"><span>Only my lists</span><select id="fMine"><option value="">All springs</option><option value="been" ${S.f.mine === "been" ? "selected" : ""}>Places I have been</option><option value="want" ${S.f.mine === "want" ? "selected" : ""}>Places I want to go</option></select></label>
    <div class="row"><button class="btn" id="fApply">Show springs</button><button class="btn ghost" id="fClear">Clear all</button></div>
    <p class="muted">Springs can only be filtered by category once visitors place them on the scale.</p>`, sh => {
    $$("[data-fc]", sh).forEach(b => b.onclick = () => { const id = Number(b.dataset.fc); S.f.cats.has(id) ? S.f.cats.delete(id) : S.f.cats.add(id); b.classList.toggle("on"); });
    $("#fApply", sh).onclick = () => { S.f.country = $("#fCountry").value; S.f.temp = $("#fTemp").value; S.f.minRating = Number($("#fRate").value); S.f.photos = $("#fPhotos").checked; S.f.mine = $("#fMine").value; closeSheet(); refreshMarkers(); renderDir(); };
    $("#fClear", sh).onclick = () => { S.f = { q: S.f.q, cats: new Set(), country: "", temp: "", minRating: 0, photos: false, mine: "" }; closeSheet(); refreshMarkers(); renderDir(); };
  });
}

/* ---------- spring page ---------- */
function openSpring(id, push = true) {
  const s = S.byId.get(id); if (!s) return;
  if (push) history.replaceState(null, "", "#spring=" + encodeURIComponent(id));
  const c = catOf(s.cat), r = rating(id), me = profile();
  const been = S.lists.been.includes(id), want = S.lists.want.includes(id);
  const revs = S.reviews.filter(x => x.spring === id).sort((a, b) => b.date.localeCompare(a.date));
  const phs = S.photos.filter(p => p.spring === id);
  const eds = S.edits.filter(e => e.spring === id && !e.rejected);
  const lst = S.listings.filter(l => l.spring === id);
  const note = S.notes[id];
  const facts = [
    ["Water", s.temp_c != null ? `${s.temp_c}°C · ${tempClass(s.temp_c)}` : "Not recorded"],
    ["Where", [s.region, s.country].filter(Boolean).join(", ") || "Unknown"],
    ["Position", s.lat.toFixed(4) + ", " + s.lon.toFixed(4) + (isApprox(s) ? " (approximate)" : s.posConfirmed ? " (confirmed)" : "")]
  ];
  const html = `
    <h2 style="margin-bottom:4px">${esc(s.name)}</h2>${s.alt ? `<p class="muted" style="margin:0 0 6px">${esc(s.alt)}</p>` : ""}
    <div class="row"><span class="chip"><i style="background:${c.color}"></i>${esc(c.name)}</span>
      ${s.closed ? `<span class="tag">Reported closed</span>` : ""}${s.userAdded ? `<span class="tag">Added by a visitor</span>` : ""}<span class="tag">Source: ${esc(s.src)}</span></div>
    <p class="muted" style="margin:6px 0">${esc(c.line)}</p>
    ${isApprox(s) ? `<div class="warnbox"><b>Approximate position.</b> This pin marks the nearest town, not the spring itself. Ask locally or check before you travel. Know the exact spot? <button class="btn sm" data-act="locate">Update location</button></div>` : ""}
    <div class="row">
      <button class="btn sm ${been ? "on" : "ghost"}" data-list="been">${been ? "✓ Been here" : "I have been here"}</button>
      <button class="btn sm ${want ? "on" : "ghost"}" data-list="want">${want ? "✓ Want to go" : "I want to go"}</button>
      <button class="btn sm ghost" data-act="share">Share</button>
      <button class="btn sm ghost" data-act="show">Show on map</button>
    </div>
    ${note ? `<div class="writer"><b>From the writer</b><br>${esc(note.text)}</div>` : ""}
    <div class="facts">${facts.map(f => `<div class="fact"><small>${f[0]}</small><b>${esc(f[1])}</b></div>`).join("")}</div>
    ${s.accessNote ? `<p><b>Getting there:</b> ${esc(s.accessNote)}</p>` : ""}${s.costNote ? `<p><b>Cost:</b> ${esc(s.costNote)}</p>` : ""}
    <h3>Visitor rating</h3>
    ${r ? `<p><span class="stars" style="font-size:20px">${stars(r.overall)}</span> <b>${r.overall.toFixed(1)}</b> from ${r.n} visit${r.n > 1 ? "s" : ""}</p>
      ${CRITERIA.map(cr => r.per[cr.id] ? `<div class="crit"><span>${cr.label}</span><div class="bar"><i style="width:${r.per[cr.id] * 20}%"></i></div><b>${r.per[cr.id].toFixed(1)}</b></div>` : `<div class="crit"><span>${cr.label}</span><span class="muted">Not applicable</span><span></span></div>`).join("")}`
      : `<p class="muted">No ratings yet.</p>`}
    <button class="btn" data-act="review">${revs.some(x => x.user === me.id) ? "Update my rating" : "Rate this spring"}</button>
    ${revs.filter(x => x.text).map(x => `<div class="card" style="margin-top:10px"><b>${esc(x.handle)}</b> <span class="stars">${stars(x.r.worth || 3)}</span><br>${esc(x.text)}<br><small class="muted">${new Date(x.date).toLocaleDateString("en-GB")}</small></div>`).join("")}
    <h3 style="margin-top:18px">Photos (${phs.length})</h3>
    ${phs.length ? `<div class="photos">${phs.map((p, i) => `<img src="${p.data}" alt="${esc(p.caption || s.name)}" data-ph="${i}" loading="lazy">`).join("")}</div>` : `<p class="muted">No photos yet.</p>`}
    <p><button class="btn ghost sm" data-act="photo">Add a photo</button></p>
    <h3 style="margin-top:18px">Where does this spring sit on the scale?</h3>
    <div class="row">${CATS.map(k => `<button class="chip btn" data-vote="${k.id}"><i style="background:${k.color}"></i>${esc(k.name)}</button>`).join("")}</div>
    <h3 style="margin-top:18px">Check the details</h3>
    <p class="muted">Correct anything that is wrong. A suggestion shows once another visitor confirms it${CONFIG.confirmThreshold < 2 ? " (test build: shows straight away)" : ""}.</p>
    ${eds.map(e => e.field === "position" ? posCard(e) : `<div class="card"><b>${esc(({ name: "Name", temp_c: "Temperature °C", access: "Getting there", cost: "Cost", closed: "Closed or gone" })[e.field] || e.field)}:</b> ${esc(e.value)}<br>
      <small class="muted">Suggested by ${esc(e.handle)} · ${1 + (e.confirm || []).length} confirm${(e.confirm || []).length ? "s" : ""}</small>
      ${e.user !== me.id && !(e.confirm || []).includes(me.id) ? ` <button class="btn sm ghost" data-confirm="${esc(e.id)}">Confirm</button>` : ""}</div>`).join("")}
    <button class="btn ghost sm" data-act="correct">Suggest a correction</button> <button class="btn ghost sm" data-act="locate">Update location</button>
    <h3 style="margin-top:18px">Local listings</h3>
    ${lst.length ? lst.map(l => `<div class="card"><b>${esc(l.name)}</b> <span class="tag">${l.plan === "advert" ? "Advert" : "Free listing"}</span><br>${esc(l.text)}${l.web ? `<br><a href="${esc(l.web)}" rel="noopener nofollow" target="_blank">${esc(l.web)}</a>` : ""}</div>`).join("") : `<p class="muted">No business listed here yet.</p>`}
    <button class="btn ghost sm" data-act="list">Run this spring? Add a free listing</button>`;
  openSheet(s.name, html, sh => {
    sh.onclick = ev => {
      const t = ev.target.closest("button,img"); if (!t) return;
      if (t.dataset.list) { toggleList(t.dataset.list, id); openSpring(id, false); }
      else if (t.dataset.act === "share") share(id);
      else if (t.dataset.act === "show") { closeSheet(); flyTo(s, 13); }
      else if (t.dataset.act === "review") openReview(id);
      else if (t.dataset.act === "photo") openPhoto(id);
      else if (t.dataset.act === "correct") openCorrect(id);
      else if (t.dataset.act === "locate") openLocate(id);
      else if (t.dataset.act === "list") openListing(id);
      else if (t.dataset.vote) { vote(id, Number(t.dataset.vote)); }
      else if (t.dataset.confirm) { confirmEdit(t.dataset.confirm, id); }
      else if (t.dataset.ph != null) { const p = phs[Number(t.dataset.ph)]; openSheet(s.name + ": photo", `<img src="${p.data}" style="width:100%;border-radius:10px"><p><span class="tag">${p.kind === "pro" ? "Professional-style (book terms agreed)" : "Holiday snap"}</span> by ${esc(p.handle)}${p.caption ? "<br>" + esc(p.caption) : ""}</p><button class="btn ghost" id="backS">Back</button>`, h => $("#backS", h).onclick = () => openSpring(id, false)); }
    };
  });
}
function toggleList(which, id) {
  const l = S.lists[which], i = l.indexOf(id);
  if (i >= 0) l.splice(i, 1); else l.push(id);
  save("lists"); toast(i >= 0 ? "Removed from your list" : which === "been" ? "Added to places you have been" : "Added to places you want to go");
}
function share(id) {
  const url = location.origin + location.pathname + "#spring=" + encodeURIComponent(id);
  if (navigator.share) navigator.share({ title: S.byId.get(id).name, url }).catch(() => { });
  else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => toast("Link copied"));
}
function vote(id, cat) {
  const me = profile(); S.cats = S.cats.filter(v => !(v.spring === id && v.user === me.id)); S.cats.push({ spring: id, user: me.id, cat }); save("cats");
  rebuild(); refreshMarkers(); toast("Thanks, your placement is counted"); openSpring(id, false);
}
function confirmEdit(eid, id) {
  const e = S.edits.find(x => x.id === eid), me = profile(); if (!e) return;
  e.confirm = e.confirm || []; if (!e.confirm.includes(me.id)) e.confirm.push(me.id);
  save("edits"); rebuild(); refreshMarkers(); toast("Confirmed"); openSpring(id, false);
}

/* ---------- forms ---------- */
function openReview(id) {
  const s = S.byId.get(id), me = profile();
  const prev = S.reviews.find(x => x.spring === id && x.user === me.id);
  const val = {}; CRITERIA.forEach(c => val[c.id] = prev ? prev.r[c.id] || 0 : 0);
  const naStaff = prev ? !prev.r.staff : false;
  openSheet("Rate " + s.name, `
    ${CRITERIA.map(c => `<div class="field" data-crit="${c.id}"><span>${c.label}</span><small class="muted">${c.help}</small>
      <div class="stargrp">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-v="${n}" class="${val[c.id] >= n ? "on" : ""}" aria-label="${n} stars">★</button>`).join("")}</div>
      ${c.na ? `<label><input type="checkbox" id="staffNA" ${naStaff ? "checked" : ""}> Not applicable (nobody works here)</label>` : ""}</div>`).join("")}
    <label class="field"><span>Your words (optional)</span><textarea id="rText" maxlength="600" placeholder="What should the next visitor know?">${esc(prev ? prev.text : "")}</textarea></label>
    <p class="muted">Posting as <b>${esc(me.handle)}</b>. Only your handle is shown.</p>
    <div class="row"><button class="btn" id="rSave">Save rating</button><button class="btn ghost" id="rBack">Back</button></div>`, sh => {
    $$("[data-crit]", sh).forEach(row => { const cid = row.dataset.crit; $$(".stargrp button", row).forEach(b => b.onclick = () => { val[cid] = Number(b.dataset.v); $$(".stargrp button", row).forEach(x => x.classList.toggle("on", Number(x.dataset.v) <= val[cid])); }); });
    $("#rBack", sh).onclick = () => openSpring(id, false);
    $("#rSave", sh).onclick = () => {
      const na = $("#staffNA", sh).checked; if (na) val.staff = 0;
      const need = CRITERIA.filter(c => !(c.id === "staff" && na)).find(c => !val[c.id]);
      if (need) return toast("Please rate: " + need.label);
      S.reviews = S.reviews.filter(x => !(x.spring === id && x.user === me.id));
      S.reviews.push({ spring: id, user: me.id, handle: me.handle, r: Object.assign({}, val), text: $("#rText", sh).value.trim(), date: new Date().toISOString() });
      save("reviews"); if (!S.lists.been.includes(id)) { S.lists.been.push(id); save("lists"); }
      rebuild(); refreshMarkers(); toast("Rating saved. Added to places you have been."); openSpring(id, false);
    };
  });
}
function readPhoto(file) {
  return new Promise((res, rej) => {
    const img = new Image(), u = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, CONFIG.maxPhotoPx / Math.max(img.width, img.height)); const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(u); res(cv.toDataURL("image/jpeg", .8)); };
    img.onerror = () => rej(new Error("bad image")); img.src = u;
  });
}
function openPhoto(id) {
  const s = S.byId.get(id);
  openSheet("Add a photo of " + s.name, `
    <label class="field"><span>Photo</span><input type="file" id="pFile" accept="image/*"></label>
    <div class="field"><span>Type of photo</span>
      <label><input type="radio" name="pk" value="pro"> Professional-style: may be used in the Thermal Waters of the World book</label><br>
      <label><input type="radio" name="pk" value="snap" checked> Holiday snap: shown on the site only</label></div>
    <details><summary>Photo terms</summary><p class="note">${esc(PHOTO_TERMS)}</p></details>
    <label class="field"><span>Caption (optional)</span><input id="pCap" maxlength="120"></label>
    <div class="row"><button class="btn" id="pSave">Add photo</button><button class="btn ghost" id="pBack">Back</button></div>`, sh => {
    $("#pBack", sh).onclick = () => openSpring(id, false);
    $("#pSave", sh).onclick = async () => {
      const f = $("#pFile", sh).files[0]; if (!f) return toast("Choose a photo first");
      const kind = $("input[name=pk]:checked", sh).value, me = profile();
      if (kind === "pro" && !confirm("Agree to the photo terms so this photo may appear in the book?")) return;
      try { const data = await readPhoto(f);
        S.photos.push({ spring: id, user: me.id, handle: me.handle, kind, caption: $("#pCap", sh).value.trim(), data, date: new Date().toISOString(), terms: kind === "pro" });
        if (!save("photos")) { S.photos.pop(); return toast("This device is out of space for photos"); }
        rebuild(); refreshMarkers(); toast("Photo added"); openSpring(id, false);
      } catch (e) { toast("That file could not be read as a photo"); }
    };
  });
}
function openCorrect(id) {
  const s = S.byId.get(id), me = profile();
  openSheet("Suggest a correction", `
    <label class="field"><span>What needs changing?</span><select id="cField">
      <option value="temp_c">Water temperature (°C)</option><option value="name">Name</option><option value="access">Getting there</option><option value="cost">Cost</option><option value="closed">It is closed or gone</option></select></label>
    <label class="field"><span>Correct value</span><input id="cVal" maxlength="200"></label>
    <div class="row"><button class="btn" id="cSave">Send</button><button class="btn ghost" id="cBack">Back</button></div>`, sh => {
    $("#cBack", sh).onclick = () => openSpring(id, false);
    $("#cSave", sh).onclick = () => {
      const field = $("#cField", sh).value; let value = $("#cVal", sh).value.trim();
      if (field === "closed") value = value || "Reported closed";
      if (!value) return toast("Enter the correct value");
      if (field === "temp_c" && (isNaN(Number(value)) || Number(value) < -5 || Number(value) > 120)) return toast("Enter a temperature in °C");
      S.edits.push({ id: uid(), spring: id, field, value, user: me.id, handle: me.handle, confirm: [], date: new Date().toISOString() });
      save("edits"); rebuild(); refreshMarkers(); toast("Thanks, correction sent"); openSpring(id, false);
    };
  });
}
function posCard(e) {
  let p = {}; try { p = JSON.parse(e.value); } catch (x) { }
  const v = e.verdict ? e.verdict.verdict : "pending";
  const status = v === "verified" ? `<span class="tag ok">Checked and applied</span>` : v === "rejected" ? `<span class="tag warn">Not accepted</span>` : `<span class="tag">Awaiting check</span>`;
  return `<div class="card"><b>New location:</b> ${esc(Number(p.lat).toFixed(5))}, ${esc(Number(p.lon).toFixed(5))} ${status}<br>
    <small class="muted">Suggested by ${esc(e.handle)} · ${esc(LOC_HOW[p.how] || "")}${e.verdict && e.verdict.note ? " · " + esc(e.verdict.note) : ""}</small></div>`;
}
const LOC_LIMIT = { approx: 40, record: 3 };   // furthest a new position may be from the current pin (km)
function openLocate(id, pre) {
  const s = S.byId.get(id), me = profile(); const base = S.springs_base.find(b => b.id === id) || s;
  const lat0 = pre ? pre.lat : s.lat, lon0 = pre ? pre.lon : s.lon;
  openSheet("Update location: " + s.name, `
    <p class="muted">${isApprox(s) ? "The pin is only the nearest town." : "Move the pin to where the spring really is."} Pins move only after a check, so nobody is sent to the wrong place.</p>
    <div class="row"><button class="btn sm" id="lPick">Pick on the map</button><button class="btn sm ghost" id="lGps">Use my location now</button></div>
    <div class="row"><label class="field" style="flex:1"><span>Latitude</span><input id="lLat" inputmode="decimal" value="${Number(lat0).toFixed(5)}"></label>
    <label class="field" style="flex:1"><span>Longitude</span><input id="lLon" inputmode="decimal" value="${Number(lon0).toFixed(5)}"></label></div>
    <label class="field"><span>How do you know?</span><select id="lHow">${Object.entries(LOC_HOW).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
    <div class="row"><button class="btn" id="lSend">Send for checking</button><button class="btn ghost" id="lBack">Back</button></div>`, sh => {
    $("#lBack", sh).onclick = () => openSpring(id, false);
    $("#lGps", sh).onclick = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition(p => { $("#lLat").value = p.coords.latitude.toFixed(5); $("#lLon").value = p.coords.longitude.toFixed(5); $("#lHow").value = "gps"; }, () => toast("Could not get your location")) : toast("Location is not available here");
    $("#lPick", sh).onclick = () => {
      closeSheet(); setView("map"); flyTo(s, 15); if (S.layer !== "sat") $("#btnLayer").click();
      toast("Tap the exact spot on the map"); S.map.once("click", ev => openLocate(id, { lat: ev.latlng.lat, lon: ev.latlng.lng }));
    };
    $("#lSend", sh).onclick = () => {
      const lat = parseFloat($("#lLat", sh).value), lon = parseFloat($("#lLon", sh).value);
      if (isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return toast("Enter a valid position");
      const d = km({ lat: s.lat, lon: s.lon }, { lat, lon }), lim = isApprox(s) ? LOC_LIMIT.approx : LOC_LIMIT.record;
      if (d < 0.02) return toast("That is the same place as now");
      if (d > lim) return toast("That is " + Math.round(d) + " km from the current pin. Further than " + lim + " km needs a new spring entry instead.");
      S.edits.push({ id: uid(), spring: id, field: "position", value: JSON.stringify({ lat: +lat.toFixed(5), lon: +lon.toFixed(5), how: $("#lHow", sh).value }), user: me.id, handle: me.handle, confirm: [], date: new Date().toISOString() });
      save("edits"); rebuild(); refreshMarkers(); toast("Thanks. The new location is awaiting a check."); openSpring(id, false);
    };
  });
}
function openListing(id) {
  const s = S.byId.get(id), me = profile();
  openSheet("List your business at " + s.name, `
    <p>Every spring can carry a free basic listing for the place that looks after it. Adverts, with a photo and a link, are available for a small monthly fee announced at launch. Nothing is charged in this test build.</p>
    <label class="field"><span>Business name</span><input id="lName" maxlength="80"></label>
    <label class="field"><span>Website (optional)</span><input id="lWeb" type="url" placeholder="https://"></label>
    <label class="field"><span>What you offer (opening hours, entry price, facilities)</span><textarea id="lText" maxlength="400"></textarea></label>
    <label class="field"><span>Plan</span><select id="lPlan"><option value="free">Free basic listing</option><option value="advert">Advert (small monthly fee, announced at launch)</option></select></label>
    <div class="row"><button class="btn" id="lSave">Submit listing</button><button class="btn ghost" id="lBack">Back</button></div>`, sh => {
    $("#lBack", sh).onclick = () => openSpring(id, false);
    $("#lSave", sh).onclick = () => {
      const name = $("#lName", sh).value.trim(), text = $("#lText", sh).value.trim(); if (!name || !text) return toast("Add a name and a description");
      let web = $("#lWeb", sh).value.trim(); if (web && !/^https?:\/\//i.test(web)) web = "https://" + web;
      S.listings.push({ id: uid(), spring: id, name, web, text, plan: $("#lPlan", sh).value, user: me.id, date: new Date().toISOString() });
      save("listings"); toast("Listing added"); openSpring(id, false);
    };
  });
}
function openAdd() {
  const me = profile(), c = S.map ? S.map.getCenter() : { lat: 0, lng: 0 };
  openSheet("Add a spring", `
    <p class="muted">Natural springs only: hot or cold, wild, at a hotel or with an entrance fee. Spas with treated water and swimming pools are left out.</p>
    <label class="field"><span>Name</span><input id="aName" maxlength="100"></label>
    <label class="field"><span>Country</span><input id="aCountry" maxlength="60"></label>
    <label class="field"><span>Region or state (optional)</span><input id="aRegion" maxlength="60"></label>
    <div class="row"><label class="field" style="flex:1"><span>Latitude</span><input id="aLat" inputmode="decimal" value="${c.lat.toFixed(4)}"></label>
    <label class="field" style="flex:1"><span>Longitude</span><input id="aLon" inputmode="decimal" value="${c.lng.toFixed(4)}"></label></div>
    <p class="muted">Pre-filled with the centre of the map. Move the map first, or press the button to use where you are.</p>
    <label class="field"><span>Water temperature °C (optional)</span><input id="aTemp" inputmode="decimal"></label>
    <label class="field"><span>Where on the scale?</span><select id="aCat"><option value="0">Not sure</option>${CATS.map(k => `<option value="${k.id}">${esc(k.name)}</option>`).join("")}</select></label>
    <div class="row"><button class="btn" id="aSave">Add spring</button><button class="btn ghost" id="aNear">Use my location</button></div>`, sh => {
    $("#aNear", sh).onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(p => { $("#aLat").value = p.coords.latitude.toFixed(5); $("#aLon").value = p.coords.longitude.toFixed(5); }, () => toast("Could not get your location"));
    $("#aSave", sh).onclick = () => {
      const name = $("#aName", sh).value.trim(), lat = parseFloat($("#aLat", sh).value), lon = parseFloat($("#aLon", sh).value);
      if (!name || isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return toast("Add a name and a valid position");
      const t = $("#aTemp", sh).value.trim(), cat = Number($("#aCat", sh).value);
      const rec = { id: "user-" + uid(), name, lat: +lat.toFixed(5), lon: +lon.toFixed(5), country: $("#aCountry", sh).value.trim(), region: $("#aRegion", sh).value.trim(), user: me.id };
      if (t !== "" && !isNaN(Number(t))) rec.temp_c = Number(t); if (cat) rec.cat = cat;
      S.added.push(rec); save("added"); rebuild(); refreshMarkers(); closeSheet(); setView("map"); S.map.setView([rec.lat, rec.lon], 12); toast("Spring added. Thank you."); openSpring(rec.id);
    };
  });
}

/* ---------- directory ---------- */
function renderDir() {
  const box = $("#dir"); if (!box) return;
  const list = S.springs.filter(passes);
  const by = {}; list.forEach(s => { const c = s.country || "Unknown country", r = s.region || "Other"; ((by[c] = by[c] || {})[r] = by[c][r] || []).push(s); });
  const countries = Object.keys(by).sort((a, b) => Object.values(by[b]).flat().length - Object.values(by[a]).flat().length || a.localeCompare(b));
  $("#dirFilters").innerHTML = `<button class="chip btn" id="dfOpen">Filters${activeFilters() ? " (" + activeFilters() + ")" : ""}</button><span class="muted">${fmt(list.length)} springs in ${fmt(countries.length)} countries</span>`;
  $("#dfOpen").onclick = openFilters;
  box.innerHTML = countries.slice(0, 400).map(c => {
    const n = Object.values(by[c]).flat().length;
    return `<details class="country" data-c="${esc(c)}"><summary><span>${esc(c)}</span><span class="muted">${fmt(n)}</span></summary><div class="regions"></div></details>`;
  }).join("");
  $$("details.country", box).forEach(d => d.addEventListener("toggle", () => {
    if (!d.open || d.dataset.done) return; d.dataset.done = 1; const c = d.dataset.c;
    d.querySelector(".regions").innerHTML = Object.keys(by[c]).sort().map(r => `<div class="region"><h3>${esc(r)} (${by[c][r].length})</h3>${by[c][r].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300).map(s => `<a data-open="${esc(s.id)}">${esc(s.name)}</a>`).join("")}</div>`).join("");
  }));
}

/* ---------- my springs ---------- */
function renderMe() {
  const me = profile();
  const row = id => { const s = S.byId.get(id); return s ? `<div class="item" data-open="${esc(id)}"><span class="dot" style="background:${catOf(s.cat).color}"></span><div><b>${esc(s.name)}</b><small>${esc([s.region, s.country].filter(Boolean).join(", "))}</small></div></div>` : ""; };
  const myRev = S.reviews.filter(r => r.user === me.id);
  $("#me").innerHTML = `
    <h1>My springs</h1>
    <div class="card"><b>${esc(me.handle)}</b> <span class="tag">Anonymous account</span>
      <p class="muted">Your account has no name, email or password and is kept in this browser. Ratings, photos, corrections and listings you add are shared with everyone. Your lists stay private. Pick any handle you like.</p>
      <div class="row"><input id="hName" value="${esc(me.handle)}" maxlength="24" style="padding:8px;border:1px solid var(--line);border-radius:10px"><button class="btn sm" id="hSave">Change handle</button></div></div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
      <div class="card"><h2>Places I have been (${S.lists.been.length})</h2>${S.lists.been.map(row).join("") || `<p class="muted">Nothing yet. Open any spring and press "I have been here".</p>`}</div>
      <div class="card"><h2>Places I want to go (${S.lists.want.length})</h2>${S.lists.want.map(row).join("") || `<p class="muted">Nothing yet. Open any spring and press "I want to go".</p>`}</div>
    </div>
    <div class="card"><h2>My ratings (${myRev.length})</h2>${myRev.map(r => `<div class="item" data-open="${esc(r.spring)}"><div><b>${esc(S.byId.get(r.spring)?.name || r.spring)}</b><small>${stars(r.r.worth)} ${esc(r.text || "")}</small></div></div>`).join("") || `<p class="muted">You have not rated a spring yet.</p>`}</div>
    <div class="row"><button class="btn ghost sm" id="mExport">Download my data</button><button class="btn warn sm" id="mReset">Erase my account and everything I added</button></div>`;
  $("#hSave").onclick = () => { const v = $("#hName").value.trim(); if (v.length < 3) return toast("Handle needs 3 or more characters"); me.handle = v; Store.set("profile", me); S.reviews.filter(r => r.user === me.id).forEach(r => r.handle = v); save("reviews"); renderMe(); toast("Handle changed"); };
  $("#mExport").onclick = () => { const blob = new Blob([JSON.stringify({ profile: me, lists: S.lists, reviews: myRev, added: S.added, edits: S.edits }, null, 1)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-thermal-waters.json"; a.click(); };
  $("#mReset").onclick = async () => { if (confirm("Erase your account, lists, ratings and photos?")) { if (Cloud.on) { try { await Cloud.eraseMine(); } catch (e) { return toast("Could not erase from the shared database. Try again."); } } Object.keys(localStorage).filter(k => k.startsWith("tw_")).forEach(k => localStorage.removeItem(k)); location.hash = "#map"; location.reload(); } };
}

/* ---------- about ---------- */
function renderAbout() {
  $("#about").innerHTML = `
    <h1>About Thermal Waters of the World</h1>
    <p>A free, growing reference to the natural thermal springs of the world: hot or cold, wild in the hills, at a hotel, or behind a ticket desk. Treated spa water and swimming pools are not on the map.</p>
    <h2>The scale</h2>
    <div class="catlist">${CATS.map(c => `<div class="card"><b><i class="dot" style="background:${c.color};margin:0"></i>${c.id}. ${esc(c.name)}</b><span class="muted">${esc(c.line)}</span></div>`).join("")}</div>
    <h2>How rating works</h2>
    <p>Every visitor scores five things from 1 to 5 stars: cleanliness, staff (or not applicable if nobody works there), cost, how easy it is to get there on foot or by public transport, and whether it was worth the trip. A spring's score is the average of everything visitors have given it.</p>
    <h2>Photos</h2>
    <p>Add holiday snaps for everyone to see. If you shoot professional-style pictures, you can agree to let them appear in the planned Thermal Waters of the World book.</p>
    <h2>Businesses</h2>
    <p>Run a spring or a place beside one? Add a free basic listing from the spring's page. Adverts will cost a small monthly fee, announced at launch.</p>
    <h2>Where the data comes from</h2>
    <p>The starting directory is built from open public-domain and CC0 sources: Wikidata, the NOAA thermal springs list for the United States, and a small editorial set where those are thin (such as Colombia, positions approximate until visitors confirm them). Visitors then confirm, correct and extend it. Map tiles are provided by Esri.</p>
    <div class="note"><b>Test build.</b> Everything you add is saved on your own device only. A shared database comes next, so ratings and photos from everyone appear together.</div>`;
}

/* ---------- search ---------- */
function initSearch() {
  const q = $("#q"), box = $("#suggest");
  q.addEventListener("input", () => {
    const v = q.value.trim().toLowerCase(); S.f.q = ""; if (v.length < 2) { box.hidden = true; return; }
    const hits = []; for (const s of S.springs) { if (s.name.toLowerCase().includes(v) || (s.alt || "").toLowerCase().includes(v) || (s.country || "").toLowerCase().startsWith(v)) { hits.push(s); if (hits.length >= 8) break; } }
    const countries = Array.from(new Set(S.springs.map(s => s.country).filter(c => c && c.toLowerCase().startsWith(v)))).slice(0, 3);
    box.innerHTML = countries.map(c => `<button data-country="${esc(c)}"><b>${esc(c)}</b><br><small>Show every spring in this country</small></button>`).join("") +
      hits.map(s => `<button data-open="${esc(s.id)}"><b>${esc(s.name)}</b><br><small>${esc([s.region, s.country].filter(Boolean).join(", "))}</small></button>`).join("") || `<div style="padding:12px" class="muted">No match yet</div>`;
    box.hidden = false;
  });
  box.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; box.hidden = true;
    if (b.dataset.country) { S.f.country = b.dataset.country; refreshMarkers(); renderDir(); setView("map"); const pts = S.springs.filter(s => s.country === S.f.country).map(s => [s.lat, s.lon]); if (pts.length) S.map.fitBounds(pts, { padding: [30, 30], maxZoom: 7 }); q.value = b.dataset.country; }
    else if (b.dataset.open) { q.value = ""; const s = S.byId.get(b.dataset.open); flyTo(s, 11); openSpring(s.id); } });
  document.addEventListener("click", e => { if (!e.target.closest(".searchbox")) box.hidden = true; });
}

/* ---------- views ---------- */
function setView(v) {
  S.view = v; $$(".view").forEach(x => x.classList.toggle("on", x.id === "view-" + v)); $$("#tabs button").forEach(b => b.classList.toggle("on", b.dataset.nav === v));
  if (v === "map" && S.map) setTimeout(() => S.map.invalidateSize(), 50);
  if (v === "directory") renderDir(); if (v === "me") renderMe(); if (v === "about") renderAbout();
  if (!location.hash.startsWith("#spring=")) history.replaceState(null, "", "#" + v);
  window.scrollTo(0, 0);
}
function route() {
  const h = location.hash.slice(1);
  if (h.startsWith("spring=")) { const id = decodeURIComponent(h.slice(7)); const s = S.byId.get(id); if (s) { setView("map"); S.map.setView([s.lat, s.lon], 11); openSpring(id, false); } }
  else if (["map", "directory", "me", "about"].includes(h)) setView(h);
}

document.addEventListener("click", e => {
  const o = e.target.closest("[data-open]"); if (o && !o.closest("#sheet")) { const s = S.byId.get(o.dataset.open); if (s) { openSpring(s.id); } return; }
  if (e.target.closest("[data-close]") || e.target.id === "scrim") closeSheet();
  const n = e.target.closest("[data-nav]"); if (n) { e.preventDefault(); closeSheet(); setView(n.dataset.nav); }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheet(); });

/* ---------- start ---------- */
(async function start() {
  profile();
  try {
    const [a, b] = await Promise.all([fetch("data/springs.json").then(r => r.json()), fetch("data/notes.json").then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
    S.springs_base = a; S.notes = b || {};
  } catch (e) { S.springs_base = []; document.body.insertAdjacentHTML("afterbegin", `<div class="note">The spring data could not be loaded. Please refresh.</div>`); }
  await Cloud.init();
  rebuild(); initMap(); initSearch();
  $("#sortSel").onchange = renderList;
  refreshMarkers(); route(); window.addEventListener("hashchange", route);
  window.TW = S;
})();
