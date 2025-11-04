// server.js  — Vercel Serverless Function (Node 18+)

const GOLDAPI_KEY = process.env.GOLDAPI_KEY || "goldapi-3szmoxgsmgo1ms8o-io";
const METALPRICE_KEYS = (
  process.env.METALPRICE_KEYS ||
  "a06ea2dec055d0e31754673ee846dff2,386d0a353a350f94eaf305714cde7c46"
).split(",").map(s => s.trim()).filter(Boolean);

// Util: respuesta segura (nunca 500)
function safeJson(res, body) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify(body));
}

async function metalpriceSpot(base /* XAU|XAG */) {
  const urlFor = (k) =>
    `https://api.metalpriceapi.com/v1/latest?api_key=${k}&base=${base}&currencies=USD`;
  for (const k of METALPRICE_KEYS) {
    try {
      const r = await fetch(urlFor(k), { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      const price = j?.rates?.USD;
      if (typeof price === "number") {
        return { vendor: "metalprice", price, at: j?.timestamp ? j.timestamp * 1000 : Date.now() };
      }
    } catch (_) {}
  }
  throw new Error("Metalprice no disponible");
}

async function goldapiSpot(base /* XAU|XAG */) {
  const url = `https://www.goldapi.io/api/${base}/USD`;
  const r = await fetch(url, {
    headers: {
      "x-access-token": GOLDAPI_KEY,
      "Accept": "application/json",
      "Cache-Control": "no-cache"
    },
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`GoldAPI spot ${base} ${r.status}`);
  const j = await r.json();
  // GoldAPI entrega 'price' y 'timestamp'
  const price = j?.price;
  if (typeof price !== "number") throw new Error("GoldAPI spot sin price");
  const at = j?.timestamp ? j.timestamp * 1000 : Date.now();
  return { vendor: "goldapi", price, at };
}

async function goldapiCandles(base /* XAU|XAG */, interval = "1m", limit = 240) {
  // Endpoint de historia por periodo — GoldAPI (formato estándar)
  // period: 1m|5m|15m|1h|4h|1d
  const url = `https://www.goldapi.io/api/${base}/USD/history?period=${interval}&limit=${limit}`;
  const r = await fetch(url, {
    headers: {
      "x-access-token": GOLDAPI_KEY,
      "Accept": "application/json",
      "Cache-Control": "no-cache"
    },
    cache: "no-store"
  });
  if (!r.ok) throw new Error(`GoldAPI candles ${base} ${interval} ${r.status}`);
  const j = await r.json();

  // Normalizamos a Lightweight Charts: { time: epochSec, open, high, low, close }
  const rows = Array.isArray(j?.data) ? j.data : j;
  if (!Array.isArray(rows)) throw new Error("GoldAPI candles formato inesperado");

  const bars = rows
    .map(row => {
      const t = row?.time || row?.timestamp || row?.date || row?.datetime;
      const ts = typeof t === "number" ? t * (t > 1e12 ? 0.001 : 1) : (Date.parse(t) / 1000);
      const open = +row.open, high = +row.high, low = +row.low, close = +row.close;
      if (!isFinite(ts) || !isFinite(open) || !isFinite(high) || !isFinite(low) || !isFinite(close)) return null;
      return { time: Math.floor(ts), open, high, low, close };
    })
    .filter(Boolean)
    // por si el proveedor devuelve descendente
    .sort((a, b) => a.time - b.time);

  if (!bars.length) throw new Error("GoldAPI candles vacío");
  return { vendor: "goldapi", bars };
}

module.exports = async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://local");
    const pathname = url.pathname;
    const q = Object.fromEntries(url.searchParams.entries());

    if (pathname === "/api/quote") {
      const metal = (q.metal || "XAU").toUpperCase(); // XAU | XAG
      try {
        // 1) Metalprice (más preciso spot)
        const spot = await metalpriceSpot(metal);
        return safeJson(res, { ok: true, source: spot.vendor, price: spot.price, updated: spot.at });
      } catch (e) {
        // 2) Backup GoldAPI
        try {
          const spot = await goldapiSpot(metal);
          return safeJson(res, { ok: true, source: spot.vendor, price: spot.price, updated: spot.at });
        } catch (e2) {
          return safeJson(res, { ok: false, error: "spot-failed", detail: [e.message, e2.message] });
        }
      }
    }

    if (pathname === "/api/candles") {
      const metal = (q.metal || "XAU").toUpperCase();
      const interval = (q.interval || "1m"); // 1m|5m|15m|1h|4h|1d
      const limit = Math.max(20, Math.min(1000, +(q.limit || 240)));
      try {
        const candlePack = await goldapiCandles(metal, interval, limit);
        return safeJson(res, { ok: true, source: candlePack.vendor, bars: candlePack.bars });
      } catch (e) {
        return safeJson(res, { ok: false, error: "candles-failed", detail: e.message });
      }
    }

    // Ruta desconocida
    return safeJson(res, { ok: false, error: "not-found" });
  } catch (err) {
    // Nunca 500: siempre 200 con detalle para depurar
    return safeJson(res, { ok: false, error: "handler-crash", detail: String(err?.message || err) });
  }
};
