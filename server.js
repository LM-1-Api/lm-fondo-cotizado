// server.js  (runtime Node 18 en Vercel)
// Express SOLO para la API; los archivos estáticos se sirven directo.
const express = require('express');
const app = express();

const BASE = 'https://www.goldapi.io/api';
const KEY = process.env.GOLDAPI_KEY || 'goldapi-3szmoxgsmgo1ms8o-io';

// API: /api/spot  ->  { gold:{price,updatedAt}, silver:{price,updatedAt} }
app.get('/api/spot', async (req, res) => {
  try {
    const headers = { 'x-access-token': KEY, 'Accept': 'application/json' };

    const [gr, sr] = await Promise.all([
      fetch(`${BASE}/XAU/USD`, { headers }),
      fetch(`${BASE}/XAG/USD`, { headers }),
    ]);

    if (!gr.ok || !sr.ok) {
      return res.status(502).json({
        error: `GoldAPI status XAU:${gr.status} XAG:${sr.status}`,
      });
    }
    const g = await gr.json();
    const s = await sr.json();

    const toNum = (v) => (v == null ? null : Number(v));
    const OZ = 31.1035;

    const goldPrice =
      toNum(g.price) ?? (g.price_gram_24k ? Number(g.price_gram_24k) * OZ : null);

    const silverPrice =
      toNum(s.price) ?? (s.price_gram_999 ? Number(s.price_gram_999) * OZ : null);

    if (!goldPrice || !silverPrice) {
      return res.status(500).json({ error: 'GoldAPI: precio no disponible' });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
    res.json({
      gold: { price: goldPrice, updatedAt: g.timestamp || Date.now() },
      silver: { price: silverPrice, updatedAt: s.timestamp || Date.now() },
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

module.exports = app;
