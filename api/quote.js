// api/quote.js
// Runtime: Node 18 en Vercel (fetch nativo). Devuelve {symbol, price, ts} en USD.

const TIMEOUT_MS = 5000;

// --- Utilidad de timeout con fetch ---
function withTimeout(ms, controller = new AbortController()) {
  const t = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(t) };
}

// --- PARSEADOR del feed FOREX (el JSON que pegaste) ---
function parseForexPayload(arr) {
  // Espera un array de objetos con { spreadProfilePrices: [{bid, ask, ...}], ts }
  if (!Array.isArray(arr)) throw new Error("Forex payload inválido");
  let best = null;

  for (const venue of arr) {
    const prices = venue?.spreadProfilePrices || [];
    for (const p of prices) {
      const bid = Number(p?.bid);
      const ask = Number(p?.ask);
      if (!isFinite(bid) || !isFinite(ask)) continue;
      const spread = ask - bid;
      if (spread <= 0) continue;
      if (!best || spread < best.spread) {
        best = { bid, ask, spread, ts: Number(venue?.ts) || Date.now() };
      }
    }
  }
  if (!best) throw new Error("No se encontró bid/ask en el feed");
  const mid = (best.bid + best.ask) / 2;
  return { price: mid, ts: best.ts };
}

// --- Llamada al proveedor FOREX ---
// Debes setear FOREX_XAU_URL y FOREX_XAG_URL (y FOREX_API_KEY si tu endpoint lo requiere)
async function fetchFromForex(symbol) {
  const urls = {
    XAUUSD: process.env.FOREX_XAU_URL, // p.ej: 'https://TU-ENDPOINT/xau'
    XAGUSD: process.env.FOREX_XAG_URL, // p.ej: 'https://TU-ENDPOINT/xag'
  };
  const url = urls[symbol];
  if (!url) throw new Error("URL de FOREX no configurada para " + symbol);

  const headers = {};
  if (process.env.FOREX_API_KEY) {
    headers["Authorization"] = `Bearer ${process.env.FOREX_API_KEY}`;
  }

  const { signal, cancel } = withTimeout(TIMEOUT_MS);
  try {
    const r = await fetch(url, { headers, signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    const { price, ts } = parseForexPayload(data);
    return { price, ts };
  } finally {
    cancel();
  }
}

// --- Fallback a Metalprice ---
// Carga la mejor key disponible de METALPRICE_API_KEYS = "key1,key2"
function pickMetalpriceKey() {
  const raw = (process.env.METALPRICE_API_KEYS || "").trim();
  const list = raw.split(",").map(s => s.trim()).filter(Boolean);
  if (!list.length) throw new Error("Metalprice API key no configurada");
  return list[0];
}

// Nota: ajusta la URL al formato exacto de tu cuenta de Metalprice si difiere.
async function fetchFromMetalprice(symbol) {
  const key = pickMetalpriceKey();
  const cur = symbol === "XAUUSD" ? "XAU" : "XAG";

  // Ejemplo de endpoint común de Metalprice:
  // Devuelve tasas con base USD: rates: { XAU: 0.0005 } => 1 USD = 0.0005 XAU
  // Precio en USD/oz = 1 / rateX
  const url = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=${cur}`;

  const { signal, cancel } = withTimeout(TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();

    let rate = j?.rates?.[cur];
    if (!rate) {
      // Intento alternativo por si el proveedor cambia forma
      rate = j?.data?.rates?.[cur] || j?.[cur];
    }
    if (!rate || !isFinite(rate)) throw new Error("Sin tasa válida en Metalprice");
    const price = 1 / Number(rate); // USD por 1 XAU/XAG
    return { price, ts: Date.now() };
  } finally {
    cancel();
  }
}

export default async function handler(req, res) {
  try {
    const { symbol = "XAUUSD" } = req.query;
    if (!/^(XAUUSD|XAGUSD)$/.test(symbol)) {
      res.status(400).json({ ok: false, error: "Símbolo inválido" });
      return;
    }

    // 1) Intento con tu feed FOREX
    try {
      const a = await fetchFromForex(symbol);
      res.setHeader("Cache-Control", "no-store");
      res.status(200).json({ ok: true, source: "forex", symbol, ...a });
      return;
    } catch (e) {
      // Sigue al fallback
    }

    // 2) Fallback a Metalprice
    const b = await fetchFromMetalprice(symbol);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).json({ ok: true, source: "metalprice", symbol, ...b });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "Error interno" });
  }
}
