// Daily check for new Collectible Minifigures series.
// Source: Rebrickable's public catalog downloads (no API key needed).
// New series = a set number under the "Collectible Minifigures" theme tree that the app
// doesn't know yet, with at least 6 single figures. BrickLink numbers for price lookup
// are matched by name against Brickset's CMF minifig list.
const https = require("https");
const zlib = require("zlib");
const fs = require("fs");
const path = require("path");

const KNOWN = new Set(Object.keys(JSON.parse(fs.readFileSync(path.join(__dirname, "bricklink-ids.json"), "utf8"))).map(k => k.split("-")[0]));
const BUILTIN_BL = new Set(Object.values(JSON.parse(fs.readFileSync(path.join(__dirname, "bricklink-ids.json"), "utf8"))));
const SKIP = new Set((process.env.CATALOG_SKIP || "71049").split(",").map(s => s.trim()).filter(Boolean)); // 71049 = F1 race cars, no minifigs
const CHECK_HOURS = Number(process.env.CATALOG_CHECK_HOURS) || 24;
const NOT_A_FIGURE = /random (bag|box)|complete|all sets|sealed box|6[- ]pack|tower box|display box/i;

let FILE, onBricklinkIds = () => {};
let cache = { checked: 0, error: "", series: [] };

function get(url, { gunzip = false, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { "User-Agent": "minifig-album (self-hosted collection tracker)", ...headers }, timeout: 60000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); return resolve(get(new URL(res.headers.location, url).toString(), { gunzip, headers })); }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} bei ${url}`)); }
      const chunks = [];
      const stream = gunzip ? res.pipe(zlib.createGunzip()) : res;
      stream.on("data", c => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      stream.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
  });
}

function parseCsv(text) {
  const rows = []; let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...data] = rows;
  return data.filter(r => r.length === head.length).map(r => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

const norm = s => s.toLowerCase().replace(/&/g, " and ").replace(/\(.*?\)/g, " ").replace(/[^a-z0-9 ]/g, " ")
  .split(/\s+/).filter(w => w && !["the", "costume", "suit", "fan", "guy", "girl", "minifigure", "only"].includes(w)).join(" ");
function similarity(a, b) {
  a = norm(a); b = norm(b);
  if (!a || !b) return 0;
  if (a.includes(b) || b.includes(a)) return 0.9;
  const grams = s => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const ga = grams(a), gb = grams(b); let hit = 0;
  for (const [g, n] of ga) hit += Math.min(n, gb.get(g) || 0);
  return (2 * hit) / (a.length - 1 + b.length - 1);
}

async function bricksetCmfFigs() {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const html = await get(`https://brickset.com/minifigs/category-Collectible-Minifigures/page-${page}`, { headers: { Cookie: "minifigsPageLength=200" } });
    const re = /title="([a-z]+[0-9]+[a-z]?): ([^"]+)" onError[\s\S]*?\/minifigs\/category-Collectible-Minifigures\/year-(\d+)'/g;
    let m, n = 0;
    while ((m = re.exec(html))) { n++; out.push({ id: m[1], name: m[2].replace(/&amp;/g, "&").replace(/&#39;/g, "'").split(/, (?=[A-Z])/)[0], year: Number(m[3]) }); }
    if (n === 0) break;
    await new Promise(r => setTimeout(r, 1500));
  }
  return out;
}

async function check() {
  try {
    const [themesCsv, setsCsv] = await Promise.all([
      get("https://cdn.rebrickable.com/media/downloads/themes.csv.gz", { gunzip: true }),
      get("https://cdn.rebrickable.com/media/downloads/sets.csv.gz", { gunzip: true }),
    ]);
    const themes = parseCsv(themesCsv);
    const tree = new Set(themes.filter(t => t.name === "Collectible Minifigures" && !t.parent_id).map(t => t.id));
    for (let grew = true; grew;) { grew = false; for (const t of themes) if (tree.has(t.parent_id) && !tree.has(t.id)) { tree.add(t.id); grew = true; } }
    const themeName = Object.fromEntries(themes.map(t => [t.id, t.name]));

    const groups = {};
    for (const s of parseCsv(setsCsv)) {
      if (!tree.has(s.theme_id)) continue;
      const i = s.set_num.lastIndexOf("-"); const base = s.set_num.slice(0, i), v = s.set_num.slice(i + 1);
      if (!/^\d{5}$/.test(base) || KNOWN.has(base) || SKIP.has(base)) continue;
      (groups[base] = groups[base] || []).push({ ...s, v: Number(v) });
    }

    const previous = Object.fromEntries(cache.series.map(s => [s.set, s]));
    const series = [];
    for (const [base, rows] of Object.entries(groups)) {
      const figs = rows.filter(r => r.v > 0 && !NOT_A_FIGURE.test(r.name)).sort((a, b) => a.v - b.v);
      if (figs.length < 6) continue;
      const bag = rows.find(r => r.v === 0);
      let name = bag ? bag.name.replace(/\s*-\s*(Random (Bag|Box)).*$/i, "").trim() : themeName[figs[0].theme_id];
      name = name.replace(/^Series (\d+) Minifigures$/i, "Series $1");
      const prev = previous[base];
      series.push({
        set: base, name, year: Number(figs[0].year),
        cat: /^Series \d+/i.test(name) ? "regular" : "licensed",
        figs: figs.map(f => ({ id: `${base}-${f.v}`, name: f.name, rb: f.set_num, bl: prev?.figs.find(p => p.id === `${base}-${f.v}`)?.bl || "" })),
      });
    }

    // BrickLink numbers for figures that don't have one yet
    if (series.some(s => s.figs.some(f => !f.bl))) {
      try {
        const used = new Set([...BUILTIN_BL, ...series.flatMap(s => s.figs.map(f => f.bl)).filter(Boolean)]);
        const pool = (await bricksetCmfFigs()).filter(b => !used.has(b.id));
        for (const s of series) {
          const cands = pool.filter(b => Math.abs(b.year - s.year) <= 1);
          const pairs = [];
          s.figs.forEach((f, i) => { if (!f.bl) for (const c of cands) pairs.push([similarity(f.name, c.name), i, c.id]); });
          pairs.sort((a, b) => b[0] - a[0]);
          const takenFig = new Set(), takenBl = new Set();
          for (const [score, i, id] of pairs) {
            if (score < 0.75 || takenFig.has(i) || takenBl.has(id) || used.has(id)) continue;
            s.figs[i].bl = id; takenFig.add(i); takenBl.add(id); used.add(id);
          }
        }
      } catch (e) { console.error("Katalog: BrickLink-Zuordnung über Brickset fehlgeschlagen:", e.message); }
    }

    const added = series.filter(s => !previous[s.set]).map(s => `${s.set} ${s.name}`);
    cache = { checked: Date.now(), error: "", series: series.sort((a, b) => a.set.localeCompare(b.set)) };
    if (added.length) console.log("Katalog: neue Serien gefunden:", added.join(", "));
    else console.log(`Katalog geprüft: ${series.length} zusätzliche Serie(n), nichts Neues`);
  } catch (e) {
    cache.error = e.message; cache.checked = Date.now();
    console.error("Katalog-Prüfung fehlgeschlagen:", e.message);
  }
  save(); publishIds();
}

function publishIds() {
  const map = {};
  for (const s of cache.series) for (const f of s.figs) if (f.bl) map[f.id] = f.bl;
  onBricklinkIds(map);
}

function save() {
  try { const tmp = FILE + ".tmp"; fs.writeFileSync(tmp, JSON.stringify(cache)); fs.renameSync(tmp, FILE); }
  catch (e) { console.error("Katalog speichern fehlgeschlagen:", e.message); }
}

function start(dataDir, { onIds } = {}) {
  FILE = path.join(dataDir, "catalog.json");
  if (onIds) onBricklinkIds = onIds;
  try { cache = { ...cache, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  // drop series that have since become built in
  cache.series = (cache.series || []).filter(s => !KNOWN.has(s.set) && !SKIP.has(s.set));
  publishIds();
  const due = Date.now() - (cache.checked || 0) > CHECK_HOURS * 36e5;
  const first = due ? 10000 : Math.max(10000, cache.checked + CHECK_HOURS * 36e5 - Date.now());
  setTimeout(() => { check(); setInterval(check, CHECK_HOURS * 36e5); }, first);
}

const snapshot = () => ({ checked: cache.checked, error: cache.error, series: cache.series });

module.exports = { start, snapshot, check };
