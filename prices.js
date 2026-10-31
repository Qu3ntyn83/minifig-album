// BrickLink price guide fetcher (used condition, avg price).
//  - sold:  average of sales in the last 6 months (guide_type=sold)
//  - stock: average of current listings (guide_type=stock)
// Needs BrickLink API credentials (OAuth 1.0a) in the environment.
// Results are cached in DATA_DIR/prices.json and refreshed in the background.
const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const CREDS = {
  consumerKey: process.env.BL_CONSUMER_KEY || "",
  consumerSecret: process.env.BL_CONSUMER_SECRET || "",
  token: process.env.BL_TOKEN_VALUE || "",
  tokenSecret: process.env.BL_TOKEN_SECRET || "",
};
const ENABLED = Object.values(CREDS).every(Boolean);
const CURRENCY = (process.env.PRICE_CURRENCY || "EUR").toUpperCase();
const REFRESH_DAYS = Number(process.env.PRICE_REFRESH_DAYS) || 7;
const DAILY_LIMIT = Number(process.env.BL_DAILY_CALLS) || 4000; // BrickLink allows 5000/day
const GAP_MS = 1200;

const IDS = JSON.parse(fs.readFileSync(path.join(__dirname, "bricklink-ids.json"), "utf8")); // figId -> BrickLink minifig no

let FILE, cache = { currency: CURRENCY, items: {}, calls: { day: "", n: 0 }, lastError: "" };

function enc(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

function signedGet(url) {
  const u = new URL(url);
  const oauth = {
    oauth_consumer_key: CREDS.consumerKey,
    oauth_token: CREDS.token,
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomBytes(12).toString("hex"),
    oauth_version: "1.0",
  };
  const params = [...u.searchParams.entries(), ...Object.entries(oauth)]
    .map(([k, v]) => [enc(k), enc(v)])
    .sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`).join("&");
  const base = ["GET", enc(u.origin + u.pathname), enc(params)].join("&");
  const key = `${enc(CREDS.consumerSecret)}&${enc(CREDS.tokenSecret)}`;
  oauth.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  const header = "OAuth realm=\"\", " + Object.entries(oauth).map(([k, v]) => `${k}="${enc(v)}"`).join(", ");

  return new Promise((resolve, reject) => {
    const req = https.get(u, { headers: { Authorization: header, Accept: "application/json" }, timeout: 20000 }, res => {
      let body = "";
      res.on("data", c => (body += c));
      res.on("end", () => {
        try { resolve(JSON.parse(body)); } catch { reject(new Error(`HTTP ${res.statusCode}: keine JSON-Antwort`)); }
      });
    });
    req.on("timeout", () => req.destroy(new Error("Timeout")));
    req.on("error", reject);
  });
}

function countCall() {
  const day = new Date().toISOString().slice(0, 10);
  if (cache.calls.day !== day) cache.calls = { day, n: 0 };
  cache.calls.n++;
}
function budgetLeft() {
  const day = new Date().toISOString().slice(0, 10);
  return cache.calls.day === day ? DAILY_LIMIT - cache.calls.n : DAILY_LIMIT;
}

async function guide(no, type) {
  countCall();
  const url = `https://api.bricklink.com/api/store/v1/items/MINIFIG/${encodeURIComponent(no)}/price?guide_type=${type}&new_or_used=U&currency_code=${CURRENCY}`;
  const r = await signedGet(url);
  if (!r.meta || r.meta.code !== 200) {
    const msg = (r.meta && (r.meta.description || r.meta.message)) || "unbekannter Fehler";
    const err = new Error(`BrickLink ${r.meta ? r.meta.code : "?"}: ${msg}`);
    err.fatal = r.meta && [401, 403].includes(r.meta.code);
    throw err;
  }
  const d = r.data || {};
  const avg = Number(d.avg_price);
  return { avg: Number.isFinite(avg) && avg > 0 ? Math.round(avg * 100) / 100 : null, lots: Number(d.unit_quantity) || 0, qty: Number(d.total_quantity) || 0 };
}

function save() {
  try {
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(cache));
    fs.renameSync(tmp, FILE);
  } catch (e) { console.error("Preise speichern fehlgeschlagen:", e.message); }
}

let running = false;
async function refresh() {
  if (!ENABLED || running) return;
  running = true;
  const maxAge = REFRESH_DAYS * 864e5, now = Date.now();
  const byBl = {}; // several figure ids could share one BrickLink no
  for (const [fig, bl] of Object.entries(IDS)) (byBl[bl] = byBl[bl] || []).push(fig);
  const due = Object.keys(byBl)
    .filter(bl => !cache.items[bl] || now - cache.items[bl].t > maxAge)
    .sort((a, b) => ((cache.items[a] || {}).t || 0) - ((cache.items[b] || {}).t || 0));
  if (due.length) console.log(`Preise: ${due.length} Figuren werden aktualisiert`);
  let done = 0;
  for (const bl of due) {
    if (budgetLeft() < 2) { console.log("Preise: Tageslimit erreicht, weiter morgen"); break; }
    try {
      const sold = await guide(bl, "sold");
      await new Promise(r => setTimeout(r, GAP_MS));
      const stock = await guide(bl, "stock");
      cache.items[bl] = { sold, stock, t: Date.now() };
      cache.lastError = "";
      if (++done % 10 === 0) save();
    } catch (e) {
      cache.lastError = e.message;
      console.error(`Preise ${bl}:`, e.message);
      if (e.fatal) break; // wrong credentials or IP not allowed – no point continuing
    }
    await new Promise(r => setTimeout(r, GAP_MS));
  }
  cache.currency = CURRENCY;
  save();
  running = false;
}

function start(dataDir) {
  FILE = path.join(dataDir, "prices.json");
  try { cache = { ...cache, ...JSON.parse(fs.readFileSync(FILE, "utf8")) }; } catch {}
  if (cache.currency !== CURRENCY) cache.items = {}; // currency changed – refetch
  if (!ENABLED) { console.log("Preise: keine BrickLink-Zugangsdaten gesetzt, Preisabruf aus"); return; }
  setTimeout(refresh, 5000);
  setInterval(refresh, 60 * 60 * 1000);
}

function snapshot() {
  const items = {};
  for (const [fig, bl] of Object.entries(IDS)) {
    const it = cache.items[bl];
    items[fig] = it ? { bl, s: it.sold.avg, sq: it.sold.qty, o: it.stock.avg, oq: it.stock.qty, t: it.t } : { bl };
  }
  const loaded = Object.values(cache.items).length;
  return { enabled: ENABLED, currency: CURRENCY, loaded, total: new Set(Object.values(IDS)).size, running, error: cache.lastError || "", items };
}

module.exports = { start, snapshot };
