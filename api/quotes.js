// /api/quotes.js
export const config = { runtime: 'edge' }; // rápido y barato en Vercel

const MP_KEYS = (process.env.METALPRICE_KEYS || "").split(",").map(s => s.trim()).filter(Boolean);

const SYMBOLS = {
  XAUUSD: { mp: "XAU", metalsLive: "gold", dp: 2 },
  XAGUSD: { mp: "XAG", metalsLive: "silver", dp: 2 }
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// Convierte respuesta de metalpriceapi (rates = XAU per USD) a USD por onza
function usdPerOunceFromMP(mpRates, mpCode) {
  // mpRates[mpCode] = XAU-per-USD => USD-per-XAU = 1 / rate
  const r = mpRates?.[mpCode];
  if (!r || r <= 0) return null;
  return 1 / r;
}

// Agrupa ticks [ts, price] en velas OHLC por timeframe (segundos)
function buildCandles(ticks, tfSec) {
  const buckets = new Map();
  for (const [ts, px] of ticks) {
    // metals.live entrega ts en segundos; normalizamos
    const bucket = Math.floor(ts / tfSec) * tfSec;
    const b = buckets.get(bucket) || { t: bucket, o: px, h: px, l: px, c: px };
    b.h = Math.max(b.h, px);
    b.l = Math.min(b.l, px);
    // Si es primer tick del bucket, su o es px; el último siempre será c
    b.c = px;
    buckets.set(bucket, b);
  }
  // orden cronológico
  return Array.from(buckets.values()).sort((a, b) => a.t - b.t)
    .map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c }));
}

function tfToSeconds(tf) {
  switch ((tf || "1m")) {
    case "1m": return 60;
    case "5m": return 300;
    case "15m": return 900;
    case "1h": return 3600;
    case "4h": return 14400;
    case "1d": return 86400;
    default: return 60;
  }
}

export default async function handler(req) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = (searchParams.get("symbol") || "XAUUSD").toUpperCase();
    const tf = (searchParams.get("tf") || "1m");
    const meta = SYMBOLS[symbol];
    if (!meta) {
      return new Response(JSON.stringify({ ok:false, error:"Unsupported symbol"}), { status: 400 });
    }

    const tfSec = tfToSeconds(tf);

    // --- 1) Precio spot confiable: MetalPriceAPI ---
    // Traemos ambos (XAU y XAG) de una para ahorrar llamadas.
    let spotPrice = null;
    if (MP_KEYS.length) {
      const key = pick(MP_KEYS);
      const mpURL = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=XAU,XAG`;
      const mpRes = await fetch(mpURL, { headers: { "accept": "application/json" } });
      if (mpRes.ok) {
        const mp = await mpRes.json();
        spotPrice = usdPerOunceFromMP(mp?.rates, meta.mp);
      }
    }

    // --- 2) Velas intradía reales: metals.live ---
    // Entrega ticks recientes [timestamp, price]; los combinamos a OHLC por timeframe.
    const mlURL = `https://api.metals.live/v1/spot/${meta.metalsLive}`;
    const mlRes = await fetch(mlURL, { headers: { "accept": "application/json" } });
    let candles = [];
    if (mlRes.ok) {
      const ticks = await mlRes.json(); // [[ts, px], ...]
      // Últimas ~600 muestras para tener varias horas de 1m
      const recent = ticks.slice(-800);
      candles = buildCandles(recent, tfSec);
      // Si no hay spot de MP, usamos el último close como spot
      if (!spotPrice && candles.length) spotPrice = candles[candles.length - 1].close;
    }

    if (!spotPrice) {
      return new Response(JSON.stringify({ ok:false, error:"No price from providers" }), { status: 200 });
    }

    return new Response(
      JSON.stringify({
        ok: true,
        symbol,
        tf,
        price: Number(spotPrice),
        ts: Date.now(),
        candles,
        providers: { spot: "metalpriceapi.com", candles: "metals.live" }
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          // Cache en edge por 9s para bajar costo y evitar límites
          "cache-control": "s-maxage=9, stale-while-revalidate=30",
          "access-control-allow-origin": "*"
        }
      }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error: e?.message || "unexpected" }), { status: 200 });
  }
}
