// /api/spot.js  — Vercel Serverless Function (Node 18+)

export default async function handler(req, res) {
  // Permite probar directo en el navegador sin CORS molestando
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  // TUS KEYS de Metalprice (puedes moverlas a ENV luego)
  const KEYS = [
    process.env.METALPRICE_KEY_1 || 'a06ea2dec055d0e31754673ee846dff2',
    process.env.METALPRICE_KEY_2 || '386d0a353a350f94eaf305714cde7c46'
  ].filter(Boolean);

  async function fetchFromMetalprice(key) {
    const url = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=XAU,XAG`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) {
      const txt = await r.text().catch(()=>'');
      throw new Error(`Metalprice ${r.status}: ${txt || r.statusText}`);
    }
    const j = await r.json();
    // Metalprice entrega "rates" como XAU = cantidad de XAU por 1 USD -> hay que invertir
    const xau = j?.rates?.XAU;
    const xag = j?.rates?.XAG;
    if (!xau || !xag) throw new Error('Respuesta sin rates XAU/XAG');
    const goldUsd  = 1 / Number(xau);
    const silverUsd= 1 / Number(xag);
    return {
      gold:  { price: Number(goldUsd.toFixed(2)) },
      silver:{ price: Number(silverUsd.toFixed(2)) },
      ts: j?.timestamp ? j.timestamp * 1000 : Date.now(),
      source: 'metalprice'
    };
  }

  // probamos con todas las keys hasta que una responda
  try {
    let out = null, lastError = null;
    for (const k of KEYS) {
      try { out = await fetchFromMetalprice(k); break; }
      catch (e) { lastError = e; console.error('[spot] key fail:', e.message); }
    }
    if (!out) throw lastError || new Error('Sin claves válidas');

    res.status(200).json(out);
  } catch (e) {
    console.error('[spot] fatal:', e.message);
    res.status(500).json({ error: e.message || 'internal_error' });
  }
}
