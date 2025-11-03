// /api/spot.js
// Node 18+ en Vercel: fetch global disponible

// === PONÉ TUS KEYS EN VARIABLES DE ENTORNO DE VERCEL ===
// METALPRICE_KEY_1, METALPRICE_KEY_2, GOLDAPI_KEY
// (si querés, podés dejar hardcodeadas acá en "FALLBACK_*", pero no es lo ideal)

const FALLBACK_METALPRICE_KEY_1 = "a06ea2dec055d0e31754673ee846dff2";
const FALLBACK_METALPRICE_KEY_2 = "386d0a353a350f94eaf305714cde7c46";
// Por si querés usar también GoldAPI como último respaldo:
const FALLBACK_GOLDAPI_KEY = "goldapi-3szmoxgsmgo1ms8o-io";

function two(n) {
  return Math.round(n * 100) / 100;
}

async function getFromMetalprice(apiKey) {
  const url = `https://api.metalpriceapi.com/v1/latest?api_key=${apiKey}&base=USD&currencies=XAU,XAG`;
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`metalprice ${r.status}`);
  const j = await r.json();
  if (!j?.rates?.XAU || !j?.rates?.XAG) throw new Error("metalprice bad body");
  // metalprice devuelve tasas de conversión. Para USD->XAU hay que invertir:
  const xauUsd = 1 / j.rates.XAU;
  const xagUsd = 1 / j.rates.XAG;
  return {
    provider: "metalprice",
    gold: two(xauUsd),
    silver: two(xagUsd),
  };
}

async function getFromGoldAPI(apiKey) {
  const headers = {
    "x-access-token": apiKey,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const rg = await fetch("https://www.goldapi.io/api/XAU/USD", { headers });
  if (!rg.ok) throw new Error(`goldapi gold ${rg.status}`);
  const jg = await rg.json();

  const rs = await fetch("https://www.goldapi.io/api/XAG/USD", { headers });
  if (!rs.ok) throw new Error(`goldapi silver ${rs.status}`);
  const js = await rs.json();

  return {
    provider: "goldapi",
    gold: two(jg.price),
    silver: two(js.price),
  };
}

module.exports = async (req, res) => {
  // CORS básico por si abrís desde otros dominios
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  const mp1 = process.env.METALPRICE_KEY_1 || FALLBACK_METALPRICE_KEY_1;
  const mp2 = process.env.METALPRICE_KEY_2 || FALLBACK_METALPRICE_KEY_2;
  const gk  = process.env.GOLDAPI_KEY       || FALLBACK_GOLDAPI_KEY;

  try {
    // 1) metalprice key 1
    try {
      const d = await getFromMetalprice(mp1);
      return res.status(200).json({ ...d, at: new Date().toISOString() });
    } catch (e) {}

    // 2) metalprice key 2
    try {
      const d = await getFromMetalprice(mp2);
      return res.status(200).json({ ...d, at: new Date().toISOString() });
    } catch (e) {}

    // 3) fallback goldapi (si existe)
    if (gk) {
      const d = await getFromGoldAPI(gk);
      return res.status(200).json({ ...d, at: new Date().toISOString() });
    }

    throw new Error("No provider worked");
  } catch (err) {
    console.error("spot error:", err);
    return res.status(502).json({
      error: "upstream_failed",
      message: String(err?.message || err),
    });
  }
};
