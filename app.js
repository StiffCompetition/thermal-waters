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
const NOCAT = { id: 0, name: "Not yet classified", line: "Rate Getting there and Facilities and this spring lands on the scale.", color: "#78909c" };
const catOf = id => CATS.find(c => c.id === Number(id)) || NOCAT;

/* Five measures, three named answers each (1, 2, 3). They roll up into the score out of 10;
   Getting there and Facilities together also place the spring on the type scale above. */
const CRITERIA = [
  { id: "access", label: "Getting there", help: "On foot, public transport or by road", opts: ["Hard trek", "Doable", "Walk up"] },
  { id: "facil", label: "Facilities", help: "Changing rooms, toilets, showers, staff", opts: ["None", "Basics", "Full"] },
  { id: "clean", label: "Cleanliness", help: "The site: litter, changing areas, banks", opts: ["Grubby", "Fine", "Spotless"] },
  { id: "cost", label: "Cost", help: "Value for money", opts: ["Pricey", "Fair", "Free or cheap"] },
  { id: "worth", label: "Worth the trip", help: "Would you go again?", opts: ["Skip it", "Good", "Go"] }
];
/* Descriptors: shown and searchable, never scored */
const WATER_LOOK = ["Clear", "Milky blue", "Cloudy", "Muddy"];
const WATER_KIND = ["Sulphur", "Iron-rich", "Salty", "Fizzy", "Plain mineral"];
const PAY = ["Free", "Cash only", "Card", "QR or bank transfer", "Pay in advance online"];
const TEMPS = ["Cold", "Warm", "Hot", "Very hot"];
/* answers on the old 1 to 5 star scale are converted so earlier test ratings still count */
function norm(r) {
  const o = {}, old = "staff" in r || CRITERIA.some(c => r[c.id] > 3);
  CRITERIA.forEach(c => { const v = Number(r[c.id]) || 0; o[c.id] = !v ? 0 : old ? (c.id === "facil" ? 0 : Math.round(1 + (v - 1) / 2)) : Math.min(3, v); });
  return o;
}
/* type scale from the average Getting there (A) and Facilities (F) answers, 1 to 3 */
function typeFrom(per) {
  const F = per.facil, A = per.access || 2; if (!F) return 0;
  if (F < 1.5) return A < 2.5 ? 1 : 2;
  if (A < 1.5 && F < 2.2) return 1;
  if (F < 2.2) return 3;
  return F < 2.7 ? 4 : 5;
}

/* ---------- sample spring: invented, shown only so the rating pages can be seen; never saved to the database ---------- */
const SAMPLE_ID = "sample-1";
const sampleSvg = (sky, water, label) => "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="${sky}"/><circle cx="320" cy="60" r="28" fill="#ffe9a8"/><path d="M0 170 L90 110 L170 160 L260 95 L400 175 L400 300 L0 300Z" fill="#7b9a8a"/><ellipse cx="200" cy="225" rx="150" ry="52" fill="#d9d2c3"/><ellipse cx="200" cy="222" rx="132" ry="42" fill="${water}"/><g fill="#fff" opacity=".55"><circle cx="160" cy="205" r="9"/><circle cx="215" cy="198" r="12"/><circle cx="250" cy="214" r="7"/></g><text x="200" y="285" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#16313a">${label}</text></svg>`);
const SAMPLE = {
  reviews: [
    ["Steamy-Sam", { access: 2, facil: 2, clean: 3, cost: 3, worth: 3 }, "Free, quiet and properly hot. A 20 minute walk from the car park.", "Clear", ["Sulphur"], ["Free"]],
    ["Pool-Pete", { access: 3, facil: 2, clean: 2, cost: 3, worth: 2 }, "Went at sunrise and had it to ourselves.", "Clear", ["Sulphur"], ["Free"]],
    ["Mia-in-Mud", { access: 2, facil: 1, clean: 2, cost: 3, worth: 2 }, "Bit of algae on the rocks. Take sandals.", "Cloudy", ["Sulphur", "Iron-rich"], ["Free"]],
    ["Tubby-Tom", { access: 3, facil: 2, clean: 2, cost: 3, worth: 3 }, "Bus stops at the end of the lane.", "Clear", [], ["Free"]],
    ["Lagoon-Lou", { access: 2, facil: 2, clean: 3, cost: 2, worth: 3 }, "Best soak of the whole trip. Small cash box by the hut.", "Milky blue", ["Sulphur"], ["Cash only"]],
    ["Kettle-Kat", { access: 1, facil: 1, clean: 1, cost: 3, worth: 2 }, "Busy at weekends and the path is rough.", "Cloudy", [], ["Free"]]
  ].map(([h, r, t, look, kinds, pay], i) => ({ spring: SAMPLE_ID, user: "sample-u" + i, handle: h, r, text: t, water: { look, kinds }, pay, date: "2026-11-0" + (i + 1) + "T10:00:00Z" })),
  photos: [
    { kind: "pro", caption: "Dawn over the main pool", data: sampleSvg("#f6c9a0", "#7fd0d6", "Dawn over the main pool"), terms: true },
    { kind: "snap", caption: "Our towels on the rocks", data: sampleSvg("#bfe3f0", "#5bbcc7", "Our towels on the rocks"), terms: false },
    { kind: "snap", caption: "Steam on a cold morning", data: sampleSvg("#d6dde2", "#8fd6da", "Steam on a cold morning"), terms: false }
  ].map((p, i) => Object.assign(p, { spring: SAMPLE_ID, user: "sample-u" + i, handle: ["Steamy-Sam", "Pool-Pete", "Mia-in-Mud"][i], date: "2026-11-0" + (i + 1) + "T10:00:00Z", id: "sample-p" + i }))
};

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
const blankFilters = q => ({ q, cats: new Set(), country: "", temp: "", minRating: 0, photos: false, mine: "", kind: "", pay: "" });
const S = {
  springs: [], byId: new Map(), notes: {},
  reviews: Store.get("reviews", []), photos: Store.get("photos", []), lists: Store.get("lists", { been: [], want: [] }),
  edits: Store.get("edits", []), added: Store.get("added", []), listings: Store.get("listings", []), cats: Store.get("cats", []),
  f: blankFilters(""),
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
  /* the emailed button brings the session back in the address: keep it and tidy the address */
  async fromLink() {
    const h = location.hash;
    if (!/access_token=|error_code=/.test(h)) return;
    const p = new URLSearchParams(h.replace(/^#/, ""));
    history.replaceState(null, "", location.pathname + location.search + "#me");
    if (p.get("error_code") || p.get("error")) { this.note = "That email link has expired or was already used. Ask for a new one."; return; }
    const at = p.get("access_token"), rt = p.get("refresh_token");
    if (!at || !rt) return;
    const r = await fetch(this.url + "/auth/v1/user", { headers: { apikey: this.key, Authorization: "Bearer " + at } });
    if (!r.ok) return;
    const user = await r.json();
    this.ses = { access_token: at, refresh_token: rt, expires_at: Math.floor(Date.now() / 1000) + Number(p.get("expires_in") || 3600), user };
    Store.set("ses", this.ses);
    this.note = "Signed in as " + (user.email || "your account");
  },
  email() { const u = this.ses && this.ses.user; return u && !u.is_anonymous && u.email ? u.email : ""; },
  /* ask for an email: keep = attach it to this anonymous account, otherwise sign in to an existing one */
  async emailLink(addr, keep) {
    const back = encodeURIComponent(location.origin + location.pathname);
    const t = await this.token();
    const r = keep
      ? await fetch(this.url + "/auth/v1/user?redirect_to=" + back, { method: "PUT", headers: { apikey: this.key, Authorization: "Bearer " + t, "Content-Type": "application/json" }, body: JSON.stringify({ email: addr }) })
      : await fetch(this.url + "/auth/v1/otp?redirect_to=" + back, { method: "POST", headers: { apikey: this.key, "Content-Type": "application/json" }, body: JSON.stringify({ email: addr, create_user: false }) });
    if (r.ok) return "sent";
    let j = {}; try { j = await r.json(); } catch (e) { }
    const c = j.error_code || "";
    if (c === "email_exists" || c === "email_address_not_authorized") return "exists";
    if (c === "otp_disabled" || c === "user_not_found") return "none";
    if (r.status === 429 || c.includes("rate_limit")) return "wait";
    return "fail";
  },
  signOut() { ["ses", "profile", "cloud1"].forEach(k => localStorage.removeItem("tw_" + k)); location.hash = "#me"; location.reload(); },
  async init() {
    try {
      await this.fromLink();
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
const scoreOf = id => { const r = rating(id); return r ? r.overall : null; };
const topKey = o => Object.entries(o || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
const answerWord = (c, v) => c.opts[Math.max(1, Math.min(3, Math.round(v))) - 1];
/* the same three measures, in the same order, wherever a spring is listed */
function metaLine(s) {
  const r = scoreOf(s.id);
  return [s.temp_c != null ? s.temp_c + "°C " + tempClass(s.temp_c).toLowerCase() : "", catOf(s.cat).name, r ? r.toFixed(1) + "/10" : "not yet rated"].filter(Boolean).join(" · ");
}

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
  const r = rating(s.id), a = S.agg.get(s.id);
  o.cat = r ? typeFrom(r.per) : 0;
  o.look = a ? topKey(a.look) : "";
  o.kinds = a ? Object.keys(a.kinds).sort((x, z) => a.kinds[z] - a.kinds[x]) : [];
  o.pay = a ? Object.keys(a.pay).sort((x, z) => a.pay[z] - a.pay[x]) : [];
  return o;
}
function rebuild() {
  S.reviews = S.reviews.filter(r => r.spring !== SAMPLE_ID).concat(SAMPLE.reviews);
  S.photos = S.photos.filter(p => p.spring !== SAMPLE_ID).concat(SAMPLE.photos);
  S.agg = new Map();
  S.reviews.forEach(r => { const a = S.agg.get(r.spring) || { n: 0, sum: {}, cnt: {}, look: {}, kinds: {}, pay: {} }, v = norm(r.r || {});
    a.n++; CRITERIA.forEach(c => { if (v[c.id]) { a.sum[c.id] = (a.sum[c.id] || 0) + v[c.id]; a.cnt[c.id] = (a.cnt[c.id] || 0) + 1; } });
    if (r.water && r.water.look) a.look[r.water.look] = (a.look[r.water.look] || 0) + 1;
    ((r.water && r.water.kinds) || []).forEach(k => a.kinds[k] = (a.kinds[k] || 0) + 1);
    (r.pay || []).forEach(k => a.pay[k] = (a.pay[k] || 0) + 1);
    S.agg.set(r.spring, a); });
  const all = S.springs_base.concat(S.added.map(a => Object.assign({ src: "Community", userAdded: true }, a)));
  S.springs = all.map(applyEdits);
  S.byId = new Map(S.springs.map(s => [s.id, s]));
  S.photoCount = new Map(); S.photos.forEach(p => S.photoCount.set(p.spring, (S.photoCount.get(p.spring) || 0) + 1));
}
function rating(id) {
  const a = S.agg.get(id); if (!a) return null;
  const per = {}; let tot = 0, k = 0;
  CRITERIA.forEach(c => { if (a.cnt[c.id]) { per[c.id] = a.sum[c.id] / a.cnt[c.id]; tot += per[c.id]; k++; } });
  /* answers 1 to 3 average, then stretch to a score from 1 to 10 */
  return { n: a.n, per, overall: k ? 1 + (tot / k - 1) * 4.5 : null };
}

/* ---------- filters ---------- */
function passes(s) {
  const f = S.f;
  if (f.cats.size && !f.cats.has(s.cat || 0)) return false;
  if (f.country && s.country !== f.country) return false;
  if (f.temp) { const t = tempClass(s.temp_c); if (t !== f.temp) return false; }
  if (f.minRating) { const r = rating(s.id); if (!r || r.overall < f.minRating) return false; }
  if (f.kind && !(s.kinds || []).includes(f.kind)) return false;
  if (f.pay && !(s.pay || []).includes(f.pay)) return false;
  if (f.photos && !S.photoCount.get(s.id)) return false;
  if (f.mine) { const l = S.lists[f.mine] || []; if (!l.includes(s.id)) return false; }
  return true;
}
const activeFilters = () => (S.f.cats.size ? 1 : 0) + (S.f.country ? 1 : 0) + (S.f.temp ? 1 : 0) + (S.f.minRating ? 1 : 0) + (S.f.kind ? 1 : 0) + (S.f.pay ? 1 : 0) + (S.f.photos ? 1 : 0) + (S.f.mine ? 1 : 0);

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
    <span class="chip"><i style="background:${c.color}"></i>${esc(c.name)}</span> <small>${esc(metaLine(s))}</small><br>${isApprox(s) ? `<span class="tag warn">Approximate position</span><br>` : ""}
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
    <div><b>${esc(s.name)}</b><small>${esc([s.region, s.country].filter(Boolean).join(", "))}<br>${esc(metaLine(s))}${isApprox(s) ? " · <span class=\"warntxt\">approximate position</span>" : ""}</small></div>
    <span class="score">${r ? r.overall.toFixed(1) : ""}</span></div>`;
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
  const sel = (id, label, opts, cur) => `<label class="field"><span>${label}</span><select id="${id}"><option value="">Any</option>${opts.map(o => `<option ${cur === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></label>`;
  openSheet("Filters", `
    <div class="field"><span>Type</span><div class="row" id="fcats">${[NOCAT].concat(CATS).map(c => `<button class="chip btn ${S.f.cats.has(c.id) ? "on" : ""}" data-fc="${c.id}"><i style="background:${c.color}"></i>${esc(c.name)}</button>`).join("")}</div></div>
    <label class="field"><span>Score</span><select id="fRate">${[0, 5, 6, 7, 8, 9].map(n => `<option value="${n}" ${S.f.minRating === n ? "selected" : ""}>${n ? n + " out of 10 and up" : "Any"}</option>`).join("")}</select></label>
    <label class="field"><span>Water temperature</span><select id="fTemp">${["", ...TEMPS].map(t => `<option value="${t}" ${S.f.temp === t ? "selected" : ""}>${t || "Any"}${t === "Cold" ? " (under 20°C)" : t === "Warm" ? " (20 to 36°C)" : t === "Hot" ? " (37 to 44°C)" : t === "Very hot" ? " (45°C and over)" : ""}</option>`).join("")}</select></label>
    ${sel("fKind", "Water kind", WATER_KIND, S.f.kind)}
    ${sel("fPay", "Payment", PAY, S.f.pay)}
    <label class="field"><span>Country</span><select id="fCountry"><option value="">All countries</option>${countries.map(c => `<option ${S.f.country === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
    <label class="field"><span><input type="checkbox" id="fPhotos" ${S.f.photos ? "checked" : ""} style="width:auto"> Has photos</span></label>
    <label class="field"><span>Only my lists</span><select id="fMine"><option value="">All springs</option><option value="been" ${S.f.mine === "been" ? "selected" : ""}>Places I have been</option><option value="want" ${S.f.mine === "want" ? "selected" : ""}>Places I want to go</option></select></label>
    <div class="row"><button class="btn" id="fApply">Show springs</button><button class="btn ghost" id="fClear">Clear all</button></div>
    <p class="muted">A spring gets its type, score, water and payment details from visitor ratings, so springs nobody has rated yet only show under "Not yet classified" and "Any".</p>`, sh => {
    $$("[data-fc]", sh).forEach(b => b.onclick = () => { const id = Number(b.dataset.fc); S.f.cats.has(id) ? S.f.cats.delete(id) : S.f.cats.add(id); b.classList.toggle("on"); });
    $("#fApply", sh).onclick = () => { S.f.country = $("#fCountry").value; S.f.temp = $("#fTemp").value; S.f.minRating = Number($("#fRate").value); S.f.kind = $("#fKind").value; S.f.pay = $("#fPay").value; S.f.photos = $("#fPhotos").checked; S.f.mine = $("#fMine").value; closeSheet(); refreshMarkers(); renderDir(); };
    $("#fClear", sh).onclick = () => { S.f = blankFilters(S.f.q); closeSheet(); refreshMarkers(); renderDir(); };
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
    ["Temperature", s.temp_c != null ? `${s.temp_c}°C · ${tempClass(s.temp_c)}` : "Not recorded"],
    ["Water", [s.look].concat(s.kinds || []).filter(Boolean).join(" · ") || "Not yet described"],
    ["Payment", (s.pay || []).join(" · ") || "Not yet described"],
    ["Where", [s.region, s.country].filter(Boolean).join(", ") || "Unknown"],
    ["Position", s.lat.toFixed(4) + ", " + s.lon.toFixed(4) + (isApprox(s) ? " (approximate)" : s.posConfirmed ? " (confirmed)" : "")]
  ];
  const html = `
    <h2 style="margin-bottom:4px">${esc(s.name)}</h2>${s.alt ? `<p class="muted" style="margin:0 0 6px">${esc(s.alt)}</p>` : ""}
    <div class="row"><span class="chip"><i style="background:${c.color}"></i>${esc(c.name)}</span>
      ${s.closed ? `<span class="tag">Reported closed</span>` : ""}${s.userAdded ? `<span class="tag">Added by a visitor</span>` : ""}<span class="tag">Source: ${esc(s.src)}</span></div>
    <p class="muted" style="margin:6px 0">${esc(c.line)}${r && r.overall ? ` <b style="color:var(--teal-d)">Score ${r.overall.toFixed(1)}/10</b>` : ""}</p>
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
    <h3>Visitor score</h3>
    ${r ? `<p><span class="bigscore">${r.overall.toFixed(1)}</span><span class="muted"> out of 10 from ${r.n} visit${r.n > 1 ? "s" : ""}</span></p>
      ${CRITERIA.map(cr => r.per[cr.id] ? `<div class="crit"><span>${cr.label}</span><div class="bar"><i style="width:${(r.per[cr.id] / 3) * 100}%"></i></div><b>${esc(answerWord(cr, r.per[cr.id]))}</b></div>` : `<div class="crit"><span>${cr.label}</span><span class="muted">No answers yet</span><span></span></div>`).join("")}`
      : `<p class="muted">No ratings yet.</p>`}
    <button class="btn" data-act="review">${revs.some(x => x.user === me.id) ? "Update my rating" : "Rate this spring"}</button>
    ${revs.filter(x => x.text).map(x => { const v = norm(x.r || {}); return `<div class="card" style="margin-top:10px"><b>${esc(x.handle)}</b> ${v.worth ? `<span class="tag">${esc(answerWord(CRITERIA[4], v.worth))}</span>` : ""}<br>${esc(x.text)}<br><small class="muted">${new Date(x.date).toLocaleDateString("en-GB")}</small></div>`; }).join("")}
    <h3 style="margin-top:18px">Photos (${phs.length})</h3>
    ${phs.length ? `<div class="photos">${phs.map((p, i) => `<img src="${p.data}" alt="${esc(p.caption || s.name)}" data-ph="${i}" loading="lazy">`).join("")}</div>` : `<p class="muted">No photos yet.</p>`}
    <p><button class="btn ghost sm" data-act="photo">Add a photo</button></p>
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
function confirmEdit(eid, id) {
  const e = S.edits.find(x => x.id === eid), me = profile(); if (!e) return;
  e.confirm = e.confirm || []; if (!e.confirm.includes(me.id)) e.confirm.push(me.id);
  save("edits"); rebuild(); refreshMarkers(); toast("Confirmed"); openSpring(id, false);
}

/* ---------- forms ---------- */
function openReview(id) {
  const s = S.byId.get(id), me = profile();
  const prev = S.reviews.find(x => x.spring === id && x.user === me.id);
  const pv = prev ? norm(prev.r || {}) : {}, val = {}; CRITERIA.forEach(c => val[c.id] = pv[c.id] || 0);
  const water = { look: prev && prev.water ? prev.water.look || "" : "", kinds: new Set(prev && prev.water ? prev.water.kinds || [] : []) };
  const pay = new Set(prev ? prev.pay || [] : []);
  const chips = (key, list, on) => list.map(o => `<button type="button" class="chip btn ${on(o) ? "on" : ""}" data-${key}="${esc(o)}">${esc(o)}</button>`).join("");
  openSheet("Rate " + s.name, `
    ${CRITERIA.map(c => `<div class="field" data-crit="${c.id}"><span>${c.label}</span><small class="muted">${c.help}</small>
      <div class="pills">${c.opts.map((o, i) => `<button type="button" data-v="${i + 1}" class="${val[c.id] === i + 1 ? "on" : ""}">${esc(o)}</button>`).join("")}</div></div>`).join("")}
    <div class="field"><span>The water (optional)</span><small class="muted">What it looks like</small><div class="row" id="wLook">${chips("look", WATER_LOOK, o => water.look === o)}</div>
      <small class="muted">What it is (tick any)</small><div class="row" id="wKind">${chips("kind", WATER_KIND, o => water.kinds.has(o))}</div></div>
    <div class="field"><span>How you pay (optional, tick any)</span><div class="row" id="wPay">${chips("pay", PAY, o => pay.has(o))}</div></div>
    <label class="field"><span>Your words (optional)</span><textarea id="rText" maxlength="600" placeholder="What should the next visitor know?">${esc(prev ? prev.text : "")}</textarea></label>
    <p class="muted">Posting as <b>${esc(me.handle)}</b>. Only your handle is shown.</p>
    <div class="row"><button class="btn" id="rSave">Save rating</button><button class="btn ghost" id="rBack">Back</button></div>`, sh => {
    $$("[data-crit]", sh).forEach(row => { const cid = row.dataset.crit; $$(".pills button", row).forEach(b => b.onclick = () => { val[cid] = Number(b.dataset.v); $$(".pills button", row).forEach(x => x.classList.toggle("on", x === b)); }); });
    $$("[data-look]", sh).forEach(b => b.onclick = () => { water.look = water.look === b.dataset.look ? "" : b.dataset.look; $$("[data-look]", sh).forEach(x => x.classList.toggle("on", x.dataset.look === water.look)); });
    $$("[data-kind]", sh).forEach(b => b.onclick = () => { const k = b.dataset.kind; water.kinds.has(k) ? water.kinds.delete(k) : water.kinds.add(k); b.classList.toggle("on"); });
    $$("[data-pay]", sh).forEach(b => b.onclick = () => { const k = b.dataset.pay; pay.has(k) ? pay.delete(k) : pay.add(k); b.classList.toggle("on"); });
    $("#rBack", sh).onclick = () => openSpring(id, false);
    $("#rSave", sh).onclick = () => {
      const need = CRITERIA.find(c => !val[c.id]);
      if (need) return toast("Please answer: " + need.label);
      if (id === SAMPLE_ID) return toast("This is an example spring, so nothing is saved. Rate a real spring.");
      S.reviews = S.reviews.filter(x => !(x.spring === id && x.user === me.id));
      S.reviews.push({ spring: id, user: me.id, handle: me.handle, r: Object.assign({}, val), water: { look: water.look, kinds: Array.from(water.kinds) }, pay: Array.from(pay), text: $("#rText", sh).value.trim(), date: new Date().toISOString() });
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
    <div class="row"><button class="btn" id="aSave">Add spring</button><button class="btn ghost" id="aNear">Use my location</button></div>`, sh => {
    $("#aNear", sh).onclick = () => navigator.geolocation && navigator.geolocation.getCurrentPosition(p => { $("#aLat").value = p.coords.latitude.toFixed(5); $("#aLon").value = p.coords.longitude.toFixed(5); }, () => toast("Could not get your location"));
    $("#aSave", sh).onclick = () => {
      const name = $("#aName", sh).value.trim(), lat = parseFloat($("#aLat", sh).value), lon = parseFloat($("#aLon", sh).value);
      if (!name || isNaN(lat) || isNaN(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return toast("Add a name and a valid position");
      const t = $("#aTemp", sh).value.trim();
      const rec = { id: "user-" + uid(), name, lat: +lat.toFixed(5), lon: +lon.toFixed(5), country: $("#aCountry", sh).value.trim(), region: $("#aRegion", sh).value.trim(), user: me.id };
      if (t !== "" && !isNaN(Number(t))) rec.temp_c = Number(t);
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
    d.querySelector(".regions").innerHTML = Object.keys(by[c]).sort().map(r => `<div class="region"><h3>${esc(r)} (${by[c][r].length})</h3>${by[c][r].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 300).map(s => `<a data-open="${esc(s.id)}">${esc(s.name)}<small>${esc(metaLine(s))}</small></a>`).join("")}</div>`).join("");
  }));
}

/* ---------- my springs ---------- */
function renderMe() {
  const me = profile();
  const row = id => { const s = S.byId.get(id); return s ? `<div class="item" data-open="${esc(id)}"><span class="dot" style="background:${catOf(s.cat).color}"></span><div><b>${esc(s.name)}</b><small>${esc([s.region, s.country].filter(Boolean).join(", "))}</small></div></div>` : ""; };
  const myRev = S.reviews.filter(r => r.user === me.id);
  $("#me").innerHTML = `
    <h1>My springs</h1>
    <div class="card"><b>${esc(me.handle)}</b> <span class="tag">${Cloud.email() ? "Account kept" : "Anonymous account"}</span>
      <p class="muted">Ratings, photos, corrections and listings you add are shared with everyone. Your lists stay private. Pick any handle you like.</p>
      <div class="row"><input id="hName" value="${esc(me.handle)}" maxlength="24" style="padding:8px;border:1px solid var(--line);border-radius:10px"><button class="btn sm" id="hSave">Change handle</button></div></div>
    ${!Cloud.on ? "" : Cloud.email() ? `<div class="card"><h2>Your account</h2><p class="muted">Signed in as <b>${esc(Cloud.email())}</b>. Sign in with the same email on any device to get everything back.</p><div class="row"><button class="btn ghost sm" id="aOut">Sign out on this device</button></div></div>` : `<div class="card"><h2>Keep your account on any device</h2>
      <p class="muted">Your account has no name or password. Add an email and we send you a button: tap it once and this account, with everything you have added, is yours on any device. We use the email only for sign-in links.</p>
      <div class="row"><input id="aMail" type="email" placeholder="you@example.com" autocomplete="email" style="padding:8px;border:1px solid var(--line);border-radius:10px;min-width:210px"><button class="btn sm" id="aKeep">Keep this account</button></div>
      <p class="muted" style="margin-top:10px">Already kept an account on another device? <a href="#me" id="aIn">Email me a sign-in link</a> instead.</p><p class="muted" id="aMsg"></p></div>`}
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(260px,1fr))">
      <div class="card"><h2>Places I have been (${S.lists.been.length})</h2>${S.lists.been.map(row).join("") || `<p class="muted">Nothing yet. Open any spring and press "I have been here".</p>`}</div>
      <div class="card"><h2>Places I want to go (${S.lists.want.length})</h2>${S.lists.want.map(row).join("") || `<p class="muted">Nothing yet. Open any spring and press "I want to go".</p>`}</div>
    </div>
    <div class="card"><h2>My ratings (${myRev.length})</h2>${myRev.map(r => `<div class="item" data-open="${esc(r.spring)}"><div><b>${esc(S.byId.get(r.spring)?.name || r.spring)}</b><small>${esc(metaLine(S.byId.get(r.spring) || {}))} ${esc(r.text || "")}</small></div></div>`).join("") || `<p class="muted">You have not rated a spring yet.</p>`}</div>
    <div class="row"><button class="btn ghost sm" id="mExport">Download my data</button><button class="btn warn sm" id="mReset">Erase my account and everything I added</button></div>`;
  $("#hSave").onclick = () => { const v = $("#hName").value.trim(); if (v.length < 3) return toast("Handle needs 3 or more characters"); me.handle = v; Store.set("profile", me); S.reviews.filter(r => r.user === me.id).forEach(r => r.handle = v); save("reviews"); renderMe(); toast("Handle changed"); };
  const mail = async keep => { const v = ($("#aMail").value || "").trim(), m = $("#aMsg"); if (!/^\S+@\S+\.\S+$/.test(v)) { m.textContent = "Type a full email address first."; return; } m.textContent = "Sending..."; let r; try { r = await Cloud.emailLink(v, keep); } catch (e) { r = "fail"; }
    m.textContent = { sent: "Sent. Open the email on this device and tap the button.", exists: "That email already has an account. Use \"Email me a sign-in link\" below instead.", none: "No account uses that email yet. Use \"Keep this account\" to add it.", wait: "Too many emails just now. Wait a minute and try again.", fail: "Could not send. Try again in a moment." }[r]; };
  if ($("#aKeep")) { $("#aKeep").onclick = () => mail(true); $("#aIn").onclick = e => { e.preventDefault(); mail(false); }; }
  if ($("#aOut")) $("#aOut").onclick = () => { if (confirm("Sign out on this device? Sign in again with your email to get everything back.")) Cloud.signOut(); };
  $("#mExport").onclick = () => { const blob = new Blob([JSON.stringify({ profile: me, lists: S.lists, reviews: myRev, added: S.added, edits: S.edits }, null, 1)], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "my-thermal-waters.json"; a.click(); };
  $("#mReset").onclick = async () => { if (confirm("Erase your account, lists, ratings and photos?")) { if (Cloud.on) { try { await Cloud.eraseMine(); } catch (e) { return toast("Could not erase from the shared database. Try again."); } } Object.keys(localStorage).filter(k => k.startsWith("tw_")).forEach(k => localStorage.removeItem(k)); location.hash = "#map"; location.reload(); } };
}

/* ---------- about ---------- */
function renderAbout() {
  $("#about").innerHTML = `
    <h1 style="font-family:Fraunces,Georgia,serif;font-weight:600;color:var(--teal-d)">About Thermal Waters of the World</h1>
    <p>A free, growing reference to the natural thermal springs of the world: hot or cold, wild in the hills, at a hotel, or behind a ticket desk. Treated spa water and swimming pools are not on the map.</p>
    <h2>The type scale</h2>
    <div class="catlist">${CATS.map(c => `<div class="card"><b><i class="dot" style="background:${c.color};margin:0"></i>${c.id}. ${esc(c.name)}</b><span class="muted">${esc(c.line)}</span></div>`).join("")}</div>
    <h2>How rating works</h2>
    <p>Visitors answer five questions, each with three named answers: <b>Getting there</b> (Hard trek, Doable, Walk up), <b>Facilities</b> (None, Basics, Full), <b>Cleanliness</b> (Grubby, Fine, Spotless), <b>Cost</b> (Pricey, Fair, Free or cheap) and <b>Worth the trip</b> (Skip it, Good, Go). The answers average into the score out of 10 shown on every spring.</p>
    <p>The type above is worked out from the Getting there and Facilities answers, so nobody votes on it separately. Water look (Clear, Milky blue, Cloudy, Muddy), water kind (Sulphur, Iron-rich, Salty, Fizzy, Plain mineral) and how you pay (Free, Cash only, Card, QR or bank transfer, Pay in advance online) are shown and searchable but never scored.</p>
    <h2>Photos</h2>
    <p>Add holiday snaps for everyone to see. If you shoot professional-style pictures, you can agree to let them appear in the planned Thermal Waters of the World book.</p>
    <h2>Businesses</h2>
    <p>Run a spring or a place beside one? Add a free basic listing from the spring's page. Adverts will cost a small monthly fee, announced at launch.</p>
    <h2>Where the data comes from</h2>
    <p>The starting directory is built from open public-domain and CC0 sources: Wikidata, the NOAA thermal springs list for the United States, and a small editorial set where those are thin (such as Colombia, positions approximate until visitors confirm them). Visitors then confirm, correct and extend it. Map tiles are provided by Esri.</p>
    <div class="note"><b>Test build.</b> Ratings, photos and corrections are shared by everyone. Accounts are anonymous; add an email on the My springs tab to keep yours on any device.</div>`;
}

/* ---------- search ---------- */
function initSearch() {
  const q = $("#q"), box = $("#suggest");
  /* typed words that match a measure offer it as a filter, using the same measures as the Filters sheet */
  const facets = v => {
    const out = [], has = (txt, w) => w.toLowerCase().startsWith(v) || w.toLowerCase().split(" ").some(x => x.startsWith(v)) || (v.length > 3 && txt.toLowerCase().includes(v));
    CATS.forEach(c => { if (has(c.name, c.name)) out.push({ key: "type:" + c.id, label: c.name, sub: "Type" }); });
    TEMPS.forEach(t => { if (t.toLowerCase().startsWith(v)) out.push({ key: "temp:" + t, label: t + " water", sub: "Temperature" }); });
    WATER_KIND.forEach(k => { if (has(k, k)) out.push({ key: "kind:" + k, label: k, sub: "Water kind" }); });
    PAY.forEach(k => { if (has(k, k)) out.push({ key: "pay:" + k, label: k, sub: "Payment" }); });
    const m = v.match(/^(?:score\s*)?(\d+(?:\.\d+)?)\s*(\+|and up|\/10)?$/);
    if (m && Number(m[1]) >= 1 && Number(m[1]) <= 10 && (m[2] || /^score/.test(v))) out.push({ key: "score:" + m[1], label: "Score " + m[1] + " out of 10 and up", sub: "Score" });
    if ("photos".startsWith(v) && v.length > 2) out.push({ key: "photos:1", label: "Has photos", sub: "Photos" });
    return out.slice(0, 5);
  };
  q.addEventListener("input", () => {
    const v = q.value.trim().toLowerCase(); S.f.q = ""; if (v.length < 2) { box.hidden = true; return; }
    const hits = []; for (const s of S.springs) { if (s.name.toLowerCase().includes(v) || (s.alt || "").toLowerCase().includes(v) || (s.country || "").toLowerCase().startsWith(v)) { hits.push(s); if (hits.length >= 8) break; } }
    const countries = Array.from(new Set(S.springs.map(s => s.country).filter(c => c && c.toLowerCase().startsWith(v)))).slice(0, 3);
    box.innerHTML = facets(v).map(f => `<button data-facet="${esc(f.key)}"><b>${esc(f.label)}</b><br><small>${esc(f.sub)}: show every matching spring</small></button>`).join("") +
      countries.map(c => `<button data-country="${esc(c)}"><b>${esc(c)}</b><br><small>Country: show every spring here</small></button>`).join("") +
      hits.map(s => `<button data-open="${esc(s.id)}"><b>${esc(s.name)}</b><br><small>${esc([s.region, s.country].filter(Boolean).join(", "))}<br>${esc(metaLine(s))}</small></button>`).join("") || `<div style="padding:12px" class="muted">No match yet</div>`;
    box.hidden = false;
  });
  box.addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; box.hidden = true;
    if (b.dataset.facet) {
      const [k, val] = [b.dataset.facet.split(":")[0], b.dataset.facet.slice(b.dataset.facet.indexOf(":") + 1)];
      S.f = blankFilters(""); 
      if (k === "type") S.f.cats.add(Number(val)); else if (k === "temp") S.f.temp = val; else if (k === "kind") S.f.kind = val; else if (k === "pay") S.f.pay = val; else if (k === "score") S.f.minRating = Number(val); else if (k === "photos") S.f.photos = true;
      refreshMarkers(); renderDir(); setView("map"); q.value = b.querySelector("b").textContent;
      const pts = S.springs.filter(passes).map(s => [s.lat, s.lon]); if (pts.length && pts.length < 400) S.map.fitBounds(pts, { padding: [30, 30], maxZoom: 7 });
      toast(pts.length ? pts.length + " springs match. Open Filters to change." : "No springs match yet. Ratings fill these in.");
    }
    else if (b.dataset.country) { S.f.country = b.dataset.country; refreshMarkers(); renderDir(); setView("map"); const pts = S.springs.filter(s => s.country === S.f.country).map(s => [s.lat, s.lon]); if (pts.length) S.map.fitBounds(pts, { padding: [30, 30], maxZoom: 7 }); q.value = b.dataset.country; }
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
    const [a, b] = await Promise.all([fetch("data/springs.json?v=20261121c").then(r => r.json()), fetch("data/notes.json?v=20261121c").then(r => r.ok ? r.json() : {}).catch(() => ({}))]);
    S.springs_base = a; S.notes = b || {};
  } catch (e) { S.springs_base = []; document.body.insertAdjacentHTML("afterbegin", `<div class="note">The spring data could not be loaded. Please refresh.</div>`); }
  await Cloud.init();
  rebuild(); initMap(); initSearch();
  $("#sortSel").onchange = renderList;
  refreshMarkers(); route(); window.addEventListener("hashchange", route);
  if (Cloud.note) toast(Cloud.note);
  window.TW = S;
})();
