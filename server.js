// server.js
// Puente a MetalPrice API. Node 18 (fetch disponible). CommonJS.

const MP_BASE = "https://api.metalpriceapi.com/v1";

function ok(res, data) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = 200;
  res.end(JSON.stringify(data));
}
function fail(res, code, message, extra = {}) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = code;
  res.end(JSON.stringify({ ok: false, error: message, ...extra }));
}
function pickKey() {
  return process.env.MP_PRIMARY_KEY || process.env.MP_SECONDARY_KEY || "";
}
function ensureSymbol(raw) {
  const s = (raw || "").toUpperCase();
  if (s === "XAUUSD" || s === "XAGUSD") return s;
  throw new Error("Símbolo inválido. Usa XAUUSD o XAGUSD.");
}
function invertUsdPerUnit(rate) {
  // MetalPrice devuelve, por defecto, "base=USD" => rate = XAU por 1 USD
  // USD por 1 XAU = 1 / rate
  if (!rate || rate <= 0) return null;
  return 1 / rate;
}
function nowIso(offsetMinutes = 0) {
  return new Date(Date.now() + offsetMinutes * 60000)
    .toISOString()
    .slice(0, 16)
    .replace("T", " ");
}

async function getLatest(symbol) {
  const key = pickKey();
  if (!key) throw new Error("Falta MP_PRIMARY_KEY/MP_SECONDARY_KEY");

  // XAUUSD -> currency = XAU
  const cur = symbol.startsWith("XAU") ? "XAU" : "XAG";
  const url = `${MP_BASE}/latest?api_key=${key}&base=USD&currencies=${cur}`;

  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));

  if (!r.ok || j.success === false) {
    throw new Error(`MetalPrice/latest error: ${j.error || r.statusText}`);
  }
  const rate = j.rates?.[cur];
  const price = invertUsdPerUnit(rate);
  if (!price) throw new Error("Respuesta sin tasa válida");

  return {
    ok: true,
    symbol,
    price, // USD por oz
    ts: j.timestamp ? j.timestamp * 1000 : Date.now()
  };
}

async function getCandles(symbol, interval = "1m", limit = 240) {
  const key = pickKey();
  if (!key) throw new Error("Falta MP_PRIMARY_KEY/MP_SECONDARY_KEY");

  const cur = symbol.startsWith("XAU") ? "XAU" : "XAG";

  // Ventana: últimas ~4 horas para 1m (ajusta si quieres más)
  const end = new Date();
  const start = new Date(end.getTime() - Math.max(1, parseInt(limit, 10)) * 60 * 1000);

  const startDate = start.toISOString().slice(0, 10);
  const endDate = end.toISOString().slice(0, 10);

  // Nota: en planes gratuitos, /timeframe suele ser por día/hora.
  // Igual lo usamos; si no hay granularidad minuto, derivamos "velas" pseudo-minuto
  // a partir de los puntos disponibles para no romper el chart.
  const url = `${MP_BASE}/timeframe?api_key=${key}&base=USD&currencies=${cur}&start_date=${startDate}&end_date=${endDate}`;

  const r = await fetch(url, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));

  if (!r.ok || j.success === false) {
    // Fallback “suave”: repetimos latest como rango plano para que no truene
    const { price, ts } = await getLatest(symbol);
    const candles = [];
    let t = Math.floor((ts - limit * 60 * 1000) / 1000);
    for (let i = 0; i < limit; i++, t += 60) {
      candles.push({ time: t, open: price, high: price, low: price, close: price });
    }
    return { ok: true, symbol, interval, candles, degraded: true };
  }

  const rateMap = j.rates || {};
  // rateMap: { '2025-11-02': { XAU: 0.00025 }, '2025-11-03': { XAU: ... } }
  // Convertimos a velas uniformes 1m distribuyendo por el día actual (mejor que nada si no hay minuto).
  const points = Object.keys(rateMap)
    .sort()
    .map((k) => ({ k, rate: rateMap[k]?.[cur] }))
    .filter((p) => p.rate);

  if (points.length === 0) {
    // Fallback a latest si no hay puntos
    const { price, ts } = await getLatest(symbol);
    const candles = [];
    let t = Math.floor((ts - limit * 60 * 1000) / 1000);
    for (let i = 0; i < limit; i++, t += 60) {
      candles.push({ time: t, open: price, high: price, low: price, close: price });
    }
    return { ok: true, symbol, interval, candles, degraded: true };
  }

  // Interpolamos simple para distribuir en 1m
  const series = [];
  const endSec = Math.floor(Date.now() / 1000);
  const startSec = endSec - limit * 60;
  const step = (points.length > 1) ? (invertUsdPerUnit(points[points.length - 1].rate) - invertUsdPerUnit(points[0].rate)) / (limit - 1) : 0;
  for (let i = 0; i < limit; i++) {
    const t = startSec + i * 60;
    const base = invertUsdPerUnit(points[0].rate);
    const price = base + step * i;
    series.push({ time: t, open: price, high: price, low: price, close: price });
  }

  return { ok: true, symbol, interval, candles: series, degraded: points.length <= 2 };
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname.replace(/^\/api\/?/, "");

    if (path === "spot") {
      const symbol = ensureSymbol(url.searchParams.get("symbol") || "XAUUSD");
      const out = await getLatest(symbol);
      return ok(res, out);
    }
    if (path === "candles") {
      const symbol = ensureSymbol(url.searchParams.get("symbol") || "XAUUSD");
      const interval = url.searchParams.get("interval") || "1m";
      const limit = parseInt(url.searchParams.get("limit") || "240", 10);
      const out = await getCandles(symbol, interval, limit);
      return ok(res, out);
    }

    return fail(res, 404, "Ruta no encontrada");
  } catch (e) {
    return fail(res, 500, "Server error", {
      message: e?.message || String(e),
      hint: "Revisa las ENV MP_PRIMARY_KEY/MP_SECONDARY_KEY en Vercel."
    });
  }
};
