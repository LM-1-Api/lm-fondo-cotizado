// /api/spot.js  — Serverless Function (Node 18, CommonJS)
module.exports = async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    // Claves de Metalprice (puedes moverlas a Variables de Entorno en Vercel)
    const KEYS = [
      process.env.METALPRICE_KEY_1 || 'a06ea2dec055d0e31754673ee846dff2',
      process.env.METALPRICE_KEY_2 || '386d0a353a350f94eaf305714cde7c46'
    ].filter(Boolean);

    async function hit(key) {
      const url = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=XAU,XAG`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text().catch(()=>r.statusText)}`);
      const j = await r.json();

      const xau = j && j.rates && j.rates.XAU;
      const xag = j && j.rates && j.rates.XAG;
      if (!xau || !xag) throw new Error('Respuesta sin rates XAU/XAG');

      // Metalprice devuelve XAU por 1 USD => invertimos para obtener USD/oz
      const goldUsd   = 1 / Number(xau);
      const silverUsd = 1 / Number(xag);

      return {
        gold:   { price: Number(goldUsd.toFixed(2)) },
        silver: { price: Number(silverUsd.toFixed(2)) },
        ts: j.timestamp ? j.timestamp * 1000 : Date.now(),
        source: 'metalprice'
      };
    }

    let out = null;
    for (const k of KEYS) {
      try { out = await hit(k); break; }
      catch (e) { console.error('[spot] key fail:', e.message); }
    }

    if (!out) {
      // Respondemos 200 con error para evitar página de crash de Vercel
      return res.status(200).json({ error: 'all_keys_failed' });
    }
    return res.status(200).json(out);

  } catch (e) {
    console.error('[spot] fatal:', e);
    // Respondemos 200 con payload de error para que NUNCA salga la página blanca de Vercel
    try { return res.status(200).json({ error: e.message || 'internal_error' }); }
    catch { return; }
  }
};
