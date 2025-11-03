// api/spot.js
// Serverless function para traer precios de GoldAPI con un pequeño cache
// para evitar rate limits (TTL ~ 55s).

let CACHE = { t: 0, data: null };

export default async function handler(req, res) {
  try {
    // TTL: 55s
    const now = Date.now();
    if (CACHE.data && now - CACHE.t < 55000) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(CACHE.data);
    }

    const KEY = process.env.GOLDAPI_KEY || 'goldapi-3szmoxgsmgo1ms8o-io';
    const headers = {
      'x-access-token': KEY,
      'Content-Type': 'application/json',
    };

    const [xauRes, xagRes] = await Promise.all([
      fetch('https://www.goldapi.io/api/XAU/USD', { headers, cache: 'no-store' }),
      fetch('https://www.goldapi.io/api/XAG/USD', { headers, cache: 'no-store' }),
    ]);

    const xau = await xauRes.json();
    const xag = await xagRes.json();

    if (xau?.error || xag?.error) {
      return res.status(200).json({
        error: xau?.error || xag?.error || 'GOLDAPI_ERROR',
        raw: { xau, xag },
      });
    }

    const goldPrice   = Number(xau?.price);
    const silverPrice = Number(xag?.price);

    const payload = {
      updatedAt: now,
      gold:   { price: isFinite(goldPrice)   ? goldPrice   : null },
      silver: { price: isFinite(silverPrice) ? silverPrice : null },
    };

    CACHE = { t: now, data: payload };
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (err) {
    return res.status(200).json({ error: 'SERVER_ERROR', message: String(err) });
  }
}
