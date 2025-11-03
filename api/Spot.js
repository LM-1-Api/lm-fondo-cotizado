// /api/spot.cjs
module.exports = async (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');

    const KEYS = [
      process.env.METALPRICE_KEY_1 || 'a06ea2dec055d0e31754673ee846dff2',
      process.env.METALPRICE_KEY_2 || '386d0a353a350f94eaf305714cde7c46'
    ].filter(Boolean);

    async function getWithKey(key) {
      const url = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=XAU,XAG`;
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();

      const xau = j?.rates?.XAU;
      const xag = j?.rates?.XAG;
      if (!xau || !xag) throw new Error('No rates XAU/XAG');

      // Metalprice da XAU por USD -> invertimos para USD/oz
      const goldUsd = 1 / Number(xau);
      const silverUsd = 1 / Number(xag);

      return {
        gold:   { price: Number(goldUsd.toFixed(2)) },
        silver: { price: Number(silverUsd.toFixed(2)) },
        ts: (j.timestamp ? j.timestamp * 1000 : Date.now()),
        source: 'metalprice'
      };
    }

    let out = null;
    for (const k of KEYS) {
      try { out = await getWithKey(k); break; }
      catch (e) { console.error('[spot] key fail:', e.message); }
    }
    if (!out) return res.status(200).json({ error: 'all_keys_failed' });
    return res.status(200).json(out);

  } catch (e) {
    console.error('[spot] fatal:', e);
    return res.status(200).json({ error: e.message || 'internal_error' });
  }
};
