// server.js  (Node.js Serverless en Vercel, CJS)
const pairMap = { XAUUSD: "XAU/USD", XAGUSD: "XAG/USD" };

// Puedes dejar tus claves acá o en variables de entorno (recomendado):
const GOLDAPI_KEY = process.env.GOLDAPI_KEY || "goldapi-3szmoxgsmgo1ms8o-io";
// Metalprice keys (fallback)
const METALPRICE_KEYS = [
  process.env.METALPRICE_KEY1,
  process.env.METALPRICE_KEY2,
  "a06ea2dec055d0e31754673ee846dff2",
  "386d0a353a350f94eaf305714cde7c46"
].filter(Boolean);

// (Opcional) si tenés velas intradía reales, poné una URL con {PAIR}:
// ej: https://www.goldapi.io/api/{PAIR}/candles?interval=1m&limit=240
const CANDLES_URL = process.env.GOLDAPI_CANDLES_URL || "";

function sendJSON(res, obj) {
  res.statusCode = 200;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

async function goldapiSpot(symbol) {
  const pair = pairMap[symbol];
  const r = await fetch(`https://www.goldapi.io/api/${pair}`, {
    headers: { "x-access-token": GOLDAPI_KEY, "Accept": "application/json" },
    cache: "no-store"
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j?.message || j?.error || "GoldAPI spot error");
  const price = Number(j.price ?? j.last ?? j.ask ?? j.bid);
  const ts = (j.timestamp ? j.timestamp * 1000 : Date.now());
  if (!price) throw new Error("GoldAPI sin precio");
  return { price, ts, raw: j };
}

// Metalprice: base=USD, currencies=XAU|XAG -> hay que invertír el rate para USD por onza
async function metalpriceSpot(symbol) {
  const cur = symbol === "XAUUSD" ? "XAU" : "XAG";
  let lastErr;
  for (const key of METALPRICE_KEYS) {
    try {
      const url = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=${cur}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw new Error(j?.error || "Metalprice falló");
      const rate = Number(j?.rates?.[cur]);
      if (!rate) throw new Error("Metalprice sin rate");
      const price = 1 / rate; // USD por XAU/XAG
      const ts = (j?.timestamp ? j.timestamp * 1000 : Date.now());
      return { price, ts, raw: j };
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("Metalprice sin datos");
}

async function getSpot(symbol) {
  try {
    return await goldapiSpot(symbol);
  } catch {
    return await metalpriceSpot(symbol);
  }
}

async function goldapiCandlesReal(symbol, limit) {
  if (!CANDLES_URL) return null;
  const pair = pairMap[symbol];
  const url = CANDLES_URL.replace("{PAIR}", pair);
  const r = await fetch(url, { headers: { "x-access-token": GOLDAPI_KEY, "Accept": "application/json" }, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !Array.isArray(j)) return null;
  const out = j.slice(-limit).map(row => ({
    time: Math.floor((row.time || row.timestamp || row.t || Date.now()) / 1000),
    open: Number(row.open ?? row.o ?? row.price ?? 0),
    high: Number(row.high ?? row.h ?? row.price ?? 0),
    low:  Number(row.low  ?? row.l ?? row.price ?? 0),
    close:Number(row.close?? row.c ?? row.price ?? 0)
  })).filter(c => c.time && c.close);
  return out.length ? out : null;
}

async function candlesFallback(symbol, limit) {
  const { price: base } = await getSpot(symbol);
  const now = Math.floor(Date.now() / 1000);
  const drift = base * 0.0002; // +-0.02% para no quedar plano
  const arr = [];
  for (let i = limit - 1; i >= 0; i--) {
    const t = now - i * 60;
    const delta = Math.sin(i / 5) * drift;
    const o = base + delta * 0.3;
    const c = base + delta * 0.6;
    const h = Math.max(o, c) + drift * 0.4;
    const l = Math.min(o, c) - drift * 0.4;
    arr.push({ time: t, open: o, high: h, low: l, close: c });
  }
  return arr;
}

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const path = u.pathname || "/";
    if (path.startsWith("/api/spot")) {
      const symbol = (u.searchParams.get("symbol") || "XAUUSD").toUpperCase();
      if (!pairMap[symbol]) return sendJSON(res, { ok:false, error:"Símbolo inválido" });
      try {
        const { price, ts } = await getSpot(symbol);
        return sendJSON(res, { ok:true, symbol, price, ts });
      } catch (e) {
        return sendJSON(res, { ok:false, error: e?.message || "spot error" });
      }
    }
    if (path.startsWith("/api/candles")) {
      const symbol = (u.searchParams.get("symbol") || "XAUUSD").toUpperCase();
      const limit = Math.min(Math.max(parseInt(u.searchParams.get("limit") || "240", 10), 60), 720);
      if (!pairMap[symbol]) return sendJSON(res, { ok:false, error:"Símbolo inválido" });
      try {
        const real = await goldapiCandlesReal(symbol, limit);
        const candles = real ?? await candlesFallback(symbol, limit);
        return sendJSON(res, { ok:true, symbol, interval:"1m", candles, degraded: !real });
      } catch (e) {
        return sendJSON(res, { ok:false, error: e?.message || "candles error" });
      }
    }
    // Cualquier otra ruta no-API -> deja que Vercel sirva estáticos (index.html)
    res.statusCode = 404;
    res.end("Not Found");
  } catch (e) {
    // nunca 500: devolvemos JSON controlado
    return sendJSON(res, { ok:false, error: e?.message || "handler error" });
  }
};
