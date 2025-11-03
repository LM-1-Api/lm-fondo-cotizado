// api/spot.js
export default async function handler(req, res) {
  try {
    const KEY = process.env.GOLDAPI_KEY || 'goldapi-3szmoxgsmgo1ms8o-io';
    const headers = {
      'x-access-token': KEY,
      'Content-Type': 'application/json'
    };

    const [xauRes, xagRes] = await Promise.all([
      fetch('https://www.goldapi.io/api/XAU/USD', { headers, cache: 'no-store' }),
      fetch('https://www.goldapi.io/api/XAG/USD', { headers, cache: 'no-store' })
    ]);

    const xau = await xauRes.json();
    const xag = await xagRes.json();

    // Si GoldAPI devuelve error, lo propagamos para ver qué pasa
    if (xau?.error || xag?.error) {
      return res.status(200).json({
        error: xau?.error || xag?.error || 'GOLDAPI_ERROR',
        raw: { xau, xag }
      });
    }

    // Tomamos "price" (fallback por si viene otro campo)
    const goldPrice   = Number(xau?.price   ?? xau?.price_gram_24k  * 31.1035 ?? null);
    const silverPrice = Number(xag?.price   ?? xag?.price_gram_999  * 31.1035 ?? null);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      updatedAt: Date.now(),
      gold:   { price: goldPrice },
      silver: { price: silverPrice }
    });
  } catch (err) {
    return res.status(200).json({ error: 'SERVER_ERROR', message: String(err) });
  }
}
