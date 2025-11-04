// /api/quotes.js
// Serverless function para: precio spot + velas por timeframe
// Fuentes: MetalPrice (con rotación de claves), GoldAPI (opcional), Metals.live (fallback)

const METALPRICE_KEYS =
  (process.env.METALPRICE_KEYS || "").split(",").map(s => s.trim()).filter(Boolean);

// Opcional: si aún querés usar tu clave de GoldAPI como fallback
const GOLDAPI_KEY = process.env.GOLDAPI_KEY || ""; // ej: goldapi-xxxxxxxx-io

const UA = "LM-Fondo-Cotizado/1.0 (+vercel)";

const SYMBOLS = {
  XAUUSD: { metal: "gold", mp: "XAU", ga: "XAU/USD" },
  XAGUSD: { metal: "silver", mp: "XAG", ga: "XAG/USD" },
};

const TF_MINUTES = { "1m": 1, "5m": 5, "15m": 15, "1h": 60, "4h": 240, "1d": 1440 };

export default async function handler(req, res) {
  try {
    // CORS básico
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.status(200).end();

    const { symbol = "XAUUSD", tf = "1m" } = req.query;
    if (!SYMBOLS[symbol]) {
      return res.status(400).json({ ok: false, error: "symbol inválido" });
    }
    if (!TF_MINUTES[tf]) {
      return res.status(400).json({ ok: false, error: "tf inválido" });
    }

    const meta = SYMBOLS[symbol];

    // 1) PRECIO SPOT: MetalPrice -> GoldAPI -> Metals.live
    let spot = await getSpotFromMetalPrice(meta.mp);
    if (spot == null) spot = await getSpotFromGoldAPI(meta.ga);
    if (spot == null) spot = await getSpotFromMetalsLive(meta.metal);

    // 2) TICKS para construir velas (de Metals.live, sin API key)
    const ticks = await getTicksFromMetalsLive(meta.metal);
    const candles = buildCandlesFromTicks(ticks, TF_MINUTES[tf]);

    return res.status(200).json({
      ok: true,
      symbol,
      tf,
      spot,
      updated_at: Date.now(),
      candles,
    });
  } catch (err) {
    console.error("quotes error:", err);
    return res.status(200).json({ ok: false, error: "internal_error" });
  }
}

// ===== Helpers =====

async function getSpotFromMetalPrice(mpSymbol) {
  if (!METALPRICE_KEYS.length) return null;

  const urls = [
    // Variante 1 (muchas cuentas usan 'symbols')
    (key) =>
      `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&symbols=${mpSymbol}`,
    // Variante 2 (algunas usan 'currencies')
    (key) =>
      `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=${mpSymbol}`,
  ];

  for (const key of METALPRICE_KEYS) {
    for (const makeUrl of urls) {
      try {
        const r = await fetch(makeUrl(key), { headers: { "User-Agent": UA } });
        if (!r.ok) continue;
        const j = await r.json();
        // Normalizaciones más comunes:
        // { rates: { XAU: 0.000249 }, base: "USD" }  → precio USD por XAU = 1 / rate
        // { rates: { XAU: 4010.12 } }                 → precio directo
        const rates = j.rates || j.data || {};
        let v = rates[mpSymbol];
        if (v == null) continue;

        // Si el valor parece ser "XAU por 1 USD" (muy chico), invertimos:
        if (v < 5) v = 1 / v;
        // Redondeo a 2 decimales (platino/plata podrían necesitar 2)
        return Math.round(v * 100) / 100;
      } catch (e) {
        // probar siguiente variante / clave
      }
    }
  }
  return null;
}

async function getSpotFromGoldAPI(gaPath) {
  if (!GOLDAPI_KEY) return null;
  try {
    const url = `https://www.goldapi.io/api/${gaPath}`;
    const r = await fetch(url, {
      headers: {
        "x-access-token": GOLDAPI_KEY,
        "Accept": "application/json",
        "User-Agent": UA,
      },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();
    const v = j?.price || j?.price_gram_24k || j?.ask;
    if (!v) return null;
    return Math.round(Number(v) * 100) / 100;
  } catch {
    return null;
  }
}

async function getSpotFromMetalsLive(metal) {
  try {
    const url = `https://api.metals.live/v1/spot/${metal}`;
    const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!r.ok) return null;
    const arr = await r.json(); // [[timestamp, price], ...]
    const last = arr[arr.length - 1];
    if (!last) return null;
    return Math.round(Number(last[1]) * 100) / 100;
  } catch {
    return null;
  }
}

async function getTicksFromMetalsLive(metal) {
  try {
    const url = `https://api.metals.live/v1/spot/${metal}`;
    const r = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    if (!r.ok) return [];
    const arr = await r.json(); // [[timestamp, price], ...] timestamp en ms/seg
    return arr
      .map(([t, p]) => ({
        // normalizamos a segundos
        ts: t > 2e12 ? Math.floor(t / 1000) : Number(t),
        price: Number(p),
      }))
      .filter((x) => Number.isFinite(x.ts) && Number.isFinite(x.price));
  } catch {
    return [];
  }
}

function buildCandlesFromTicks(ticks, tfMinutes) {
  if (!ticks.length) return [];
  const bucket = tfMinutes * 60; // segundos
  const map = new Map();

  for (const { ts, price } of ticks) {
    const t0 = Math.floor(ts / bucket) * bucket;
    if (!map.has(t0)) {
      map.set(t0, { time: t0, open: price, high: price, low: price, close: price });
    } else {
      const c = map.get(t0);
      c.high = Math.max(c.high, price);
      c.low = Math.min(c.low, price);
      c.close = price;
    }
  }
  return Array.from(map.values()).sort((a, b) => a.time - b.time).slice(-300);
}
