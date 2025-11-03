// /api/spot.js  — Vercel Serverless Function
// Usa la env var GOLDAPI_KEY si existe; si no, usa la key que me diste.
const KEY  = process.env.GOLDAPI_KEY || 'goldapi-3szmoxgsmgo1ms8o-io';
const BASE = 'https://www.goldapi.io/api';

async function getPair(pair) {
  const res = await fetch(`${BASE}/${pair}`, {
    headers: {
      'x-access-token': KEY,
      'Accept': 'application/json'
    },
    cache: 'no-store'
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GoldAPI ${pair} ${res.status}: ${txt}`);
  }
  return res.json();
}

module.exports = async (req, res) => {
  try {
    const [g, s] = await Promise.all([
      getPair('XAU/USD'),
      getPair('XAG/USD'),
    ]);

    const gPrice = Number(g.price ?? g.close_price ?? g.open_price);
    const sPrice = Number(s.price ?? s.close_price ?? s.open_price);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json({
      gold:   { price: gPrice, ts: g.timestamp || Math.floor(Date.now()/1000) },
      silver: { price: sPrice, ts: s.timestamp || Math.floor(Date.now()/1000) },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
};
