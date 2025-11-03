// /api/spot.js — Vercel Serverless Function
// Variante A: usa variable de entorno si existe (recomendado),
// o tu key por defecto si no está configurada.
const KEY  = process.env.GOLDAPI_KEY || 'goldapi-3szmoxgsmgo1ms8o-io';
const BASE = 'https://www.goldapi.io/api';

async function getPair(pair) {
  const res = await fetch(`${BASE}/${pair}`, {
    headers: {
      'x-access-token': KEY,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GoldAPI ${pair} ${res.status}: ${txt}`);
  }
  return res.json();
}

function pickPrice(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // GoldAPI puede devolver en distintos campos
  if (obj.price != null) return Number(obj.price);
  if (obj.close_price != null) return Number(obj.close_price);
  if (obj.open_price  != null) return Number(obj.open_price);
  // fallback por gramo → onza troy
  const OZ = 31.1034768;
  if (obj.price_gram_24k != null) return Number(obj.price_gram_24k) * OZ;
  if (obj.price_gram_22k != null) return Number(obj.price_gram_22k) * OZ;
  return null;
}

async function handler(req, res) {
  try {
    const [g, s] = await Promise.all([ getPair('XAU/USD'), getPair('XAG/USD') ]);

    const gPrice = pickPrice(g);
    const sPrice = pickPrice(s);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    if (gPrice == null || sPrice == null) {
      return res.status(502).json({ error: 'No price fields from GoldAPI', raw: { g, s } });
    }

    res.status(200).json({
      gold:   { price: gPrice, ts: g.timestamp || Math.floor(Date.now()/1000) },
      silver: { price: sPrice, ts: s.timestamp || Math.floor(Date.now()/1000) },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String(e) });
  }
}

// Compatibilidad CommonJS + ESM (Vercel)
module.exports = handler;
export default handler;
