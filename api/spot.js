// /api/spot.js  (Vercel Serverless Function)
const KEY = process.env.GOLDAPI_KEY || 'goldapi-3szmoxgsmgo1ms8o-io';
const BASE = 'https://www.goldapi.io/api';

async function getPair(pair) {
  const res = await fetch(`${BASE}/${pair}`, {
    headers: {
      'x-access-token': KEY,
      'Accept': 'application/json',
      'Content-Type': 'application/json'
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
    const [g, s] = await Promise.all([getPair('XAU/USD'), getPair('XAG/USD')]);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');

    res.status(200).json({
      gold:  { price: Number(g.price),  ts: g.timestamp },
      silver:{ price: Number(s.price),  ts: s.timestamp }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
