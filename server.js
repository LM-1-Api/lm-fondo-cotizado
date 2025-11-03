// /api/spot.js  (CommonJS para Vercel)
// Fuente primaria: Metalprice (2 keys); Respaldo: GoldAPI
// Responde: { gold:{price:Number}, silver:{price:Number}, source:String, ts:Number }

const MP_KEYS = [
  "a06ea2dec055d0e31754673ee846dff2",
  "386d0a353a350f94eaf305714cde7c46"
];

const GOLDAPI_TOKEN = "goldapi-3szmoxgsmgo1ms8o-io";

// Utilidad: fetch que devuelve JSON o lanza error legible
async function getJson(url, opts) {
  const r = await fetch(url, { ...(opts||{}), headers: { accept: "application/json", ...(opts?.headers||{}) } });
  const text = await r.text();
  if (!r.ok) {
    throw new Error(`HTTP ${r.status} ${text.slice(0,180)}`);
  }
  try { return JSON.parse(text); }
  catch (e) { throw new Error(`JSON parse error: ${text.slice(0,140)}`); }
}

async function fetchMetalprice(key) {
  const url = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&symbols=XAU,XAG`;
  const j = await getJson(url);
  if (!j?.rates || typeof j.rates.XAU !== "number" || typeof j.rates.XAG !== "number") {
    throw new Error("Metalprice sin rates válidos");
  }
  return {
    gold:   { price: Number(j.rates.XAU) },
    silver: { price: Number(j.rates.XAG) },
    source: "metalprice",
    ts:     (j.timestamp ? j.timestamp * 1000 : Date.now())
  };
}

async function fetchGoldApi(symbol) {
  const url = `https://www.goldapi.io/api/${symbol}/USD`;
  const j = await getJson(url, { headers: { "x-access-token": GOLDAPI_TOKEN } });
  if (typeof j?.price !== "number") throw new Error(`GoldAPI ${symbol} sin price`);
  return Number(j.price);
}

async function getSpot() {
  // 1) Intentar Metalprice con ambas keys
  for (const k of MP_KEYS) {
    try { return await fetchMetalprice(k); }
    catch (e) { /* probar siguiente key */ }
  }
  // 2) Respaldo GoldAPI
  const [g, s] = await Promise.allSettled([fetchGoldApi("XAU"), fetchGoldApi("XAG")]);
  if (g.status === "fulfilled" && s.status === "fulfilled") {
    return { gold:{price:g.value}, silver:{price:s.value}, source:"goldapi", ts:Date.now() };
  }
  throw new Error("Sin fuentes disponibles");
}

module.exports = async (req, res) => {
  try {
    const data = await getSpot();
    res.setHeader("Cache-Control", "s-maxage=10, stale-while-revalidate=20");
    res.status(200).json(data);
  } catch (e) {
    // Responder error legible para poder depurar abriendo /api/spot en el navegador
    res.status(500).json({ error: e.message || "fetch failed" });
  }
};
