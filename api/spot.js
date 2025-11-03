// /api/spot.js
// Función serverless para traer XAU/USD y XAG/USD desde GoldAPI

const BASE = 'https://www.goldapi.io/api';
const KEY = process.env.GOLDAPI_KEY || 'goldapi-3szmoxgsmgo1ms8o-io';

export default async function handler(req, res) {
  try {
    const headers = {
      'x-access-token': KEY,
      'Accept': 'application/json'
    };

    // Pedimos en paralelo
    const [gr, sr] = await Promise.all([
      fetch(`${BASE}/XAU/USD`, { headers }),
      fetch(`${BASE}/XAG/USD`, { headers }),
    ]);

    if (!gr.ok || !sr.ok) {
      const e = `GoldAPI status XAU:${gr.status} XAG:${sr.status}`;
      return res.status(502).json({ error: e });
    }

    const g = await gr.json();
    const s = await sr.json();

    // GoldAPI a veces entrega otras keys. Normalizamos:
    const toNumber = (v) => (v == null ? null : Number(v));
    const oz = 31.1035;

    const goldPrice =
      toNumber(g.price) ??
      (g.price_gram_24k ? Number(g.price_gram_24k) * oz : null);

    const silverPrice =
      toNumber(s.price) ??
      (s.price_gram_999 ? Number(s.price_gram_999) * oz : null);

    if (!goldPrice || !silverPrice) {
      return res.status(500).json({ error: 'GoldAPI: precio no disponible' });
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=600');
    res.status(200).json({
      gold: {
        price: goldPrice,
        updatedAt: g.timestamp || g.updated_at || Date.now()
      },
      silver: {
        price: silverPrice,
        updatedAt: s.timestamp || s.updated_at || Date.now()
      }
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
}
