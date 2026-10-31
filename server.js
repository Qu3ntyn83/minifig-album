// Minifiguren-Sammelalbum – minimal server, no dependencies.
// Serves public/ and stores the collection in DATA_DIR/state.json.
const http = require("http");
const fs = require("fs");
const path = require("path");
const prices = require("./prices");

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STATE = path.join(DATA_DIR, "state.json");
const BACKUPS = path.join(DATA_DIR, "backups");
const PUBLIC = path.join(__dirname, "public");
const MAX_BODY = 512 * 1024;
const KEEP_BACKUPS = Number(process.env.KEEP_BACKUPS) || 30;

fs.mkdirSync(BACKUPS, { recursive: true });
prices.start(DATA_DIR);

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, "utf8")); }
  catch { return { owned: {}, wish: {}, updated: 0 }; }
}

function clean(d) {
  const out = { owned: {}, wish: {}, updated: Number(d.updated) || Date.now() };
  for (const [k, v] of Object.entries(d.owned || {})) {
    const n = Math.min(99, Math.max(0, parseInt(v, 10) || 0));
    if (/^\d{4,5}-\d{1,2}$/.test(k) && n > 0) out.owned[k] = n;
  }
  for (const k of Object.keys(d.wish || {})) if (/^\d{4,5}-\d{1,2}$/.test(k) && d.wish[k]) out.wish[k] = 1;
  return out;
}

// one backup per day, keep the newest KEEP_BACKUPS
function dailyBackup() {
  if (!fs.existsSync(STATE)) return;
  const day = new Date().toISOString().slice(0, 10);
  const file = path.join(BACKUPS, `state-${day}.json`);
  if (!fs.existsSync(file)) fs.copyFileSync(STATE, file);
  const all = fs.readdirSync(BACKUPS).filter(f => f.startsWith("state-")).sort();
  for (const f of all.slice(0, Math.max(0, all.length - KEEP_BACKUPS))) fs.unlinkSync(path.join(BACKUPS, f));
}

function writeState(d) {
  dailyBackup();
  const tmp = STATE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d));
  fs.renameSync(tmp, STATE);
}

const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json" };

function send(res, code, body, type = "application/json") {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
  res.end(body);
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");

  if (url.pathname === "/healthz") return send(res, 200, '{"ok":true}');

  if (url.pathname === "/api/prices") return send(res, 200, JSON.stringify(prices.snapshot()));

  if (url.pathname === "/api/state") {
    if (req.method === "GET") return send(res, 200, JSON.stringify(readState()));
    if (req.method === "PUT") {
      let body = "", size = 0;
      req.on("data", c => { size += c.length; if (size > MAX_BODY) { send(res, 413, '{"error":"too large"}'); req.destroy(); } else body += c; });
      req.on("end", () => {
        if (res.writableEnded) return;
        try {
          const incoming = clean(JSON.parse(body));
          const current = readState();
          if ((current.updated || 0) > incoming.updated) return send(res, 409, JSON.stringify(current));
          writeState(incoming);
          send(res, 200, '{"ok":true}');
        } catch { send(res, 400, '{"error":"invalid json"}'); }
      });
      return;
    }
    return send(res, 405, '{"error":"method not allowed"}');
  }

  if (req.method !== "GET" && req.method !== "HEAD") return send(res, 405, "", "text/plain");
  const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC)) return send(res, 403, "", "text/plain");
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`Minifiguren-Sammelalbum läuft auf Port ${PORT}, Daten in ${DATA_DIR}`));
