// server.js — Vercel serverless (Node 18+). No hace falta Express.

const GOLDAPI_KEY =
  process.env.GOLDAPI_KEY || "goldapi-3szmoxgsmgo1ms8o-io"; // <-- tu key
const METALPRICE_KEYS = [
  process.env.METALPRICE_KEY,
  "a06ea2dec055d0e31754673ee846dff2",
  "386d0a353a350f94eaf305714cde7c46",
].filter(Boolean);

const send = (res, status, data) => {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  // CORS básico para pruebas
  res.setHeader("access-control-allow-origin", "*");
  res.end(JSON.stringify(data));
};

async function metalpriceLatest() {
  // probamos cada key hasta que una responda
  for (const key of METALPRICE_KEYS) {
    try {
      const url = `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&symbols=XAU,XAG`;
      const r = await fetch(url, { cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();
      if (!j || !j.rates) continue;

      // metalprice devuelve "XAU por USD". Precio en USD/oz = 1 / rate
      const inv = (v) => (v ? 1 / Number(v) : null);
      return {
        provider: "metalprice",
        gold: inv(j.rates.XAU),
        silver: inv(j.rates.XAG),
        ts: j.timestamp ? j.timestamp * 1000 : Date.now(),
      };
    } catch (_) {}
  }
  return null;
}

async function goldapiSpotOne(symbol) {
  try {
    const r = await fetch(`https://www.goldapi.io/api/${symbol}/USD`, {
      headers: {
        "x-access-token": GOLDAPI_KEY,
        "content-type": "application/json",
      },
      cache: "no-store",
    });
    if (!r.ok) return null;
    const j = await r.json();

    // GoldAPI puede devolver distintos campos. Normalizamos.
    const num = (v) => (typeof v === "number" && isFinite(v) ? v : null);
    const price =
      num(j.price) ??
      num(j.ask) ??
      num(j.bid) ??
      // algunos planes devuelven precio por gramo 24k; convertimos a onza troy
      (num(j.price_gram_24k) ? j.price_gram_24k * 31.1034768 : null);

    return price;
  } catch (_) {
    return null;
  }
}

async function goldapiCandles(symbol, tf = "1m", limit = 240) {
  // Diferentes cuentas de GoldAPI exponen endpoints distintos.
  // Probamos dos rutas comunes; si no, devolvemos null.
  const headers = {
    "x-access-token": GOLDAPI_KEY,
    "content-type": "application/json",
  };

  const tryUrls = [
    // v1 intraday (ej: ?interval=1m&limit=240)
    `https://www.goldapi.io/api/time_series/${symbol}/USD?interval=${tf}&limit=${limit}`,
    // histórico compacto (algunos planes)
    `https://www.goldapi.io/api/${symbol}/USD/history?period=${tf}&limit=${limit}`,
  ];

  for (const url of tryUrls) {
    try {
      const r = await fetch(url, { headers, cache: "no-store" });
      if (!r.ok) continue;
      const j = await r.json();

      // normalizamos a [{time, open, high, low, close}]
      const rows = Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : [];
      const mapped = rows
        .map((c) => {
          const t =
            Number(c?.timestamp) ||
            (c?.time ? Number(c.time) : NaN) ||
            (c?.date ? Date.parse(c.date) / 1000 : NaN);
          const open =
            Number(c?.open) ??
            Number(c?.o) ??
            Number(c?.open_price) ??
            Number(c?.open_value);
          const high =
            Number(c?.high) ??
            Number(c?.h) ??
            Number(c?.high_price) ??
            Number(c?.high_value);
          const low =
            Number(c?.low) ??
            Number(c?.l) ??
            Number(c?.low_price) ??
            Number(c?.low_value);
          const close =
            Number(c?.close) ??
            Number(c?.c) ??
            Number(c?.price) ??
            Number(c?.close_value);
          if ([t, open, high, low, close].every((n) => isFinite(n))) {
            return { time: Math.floor(t), open, high, low, close };
          }
          return null;
        })
        .filter(Boolean);

      if (mapped.length) {
        return { provider: "goldapi", candles: mapped };
      }
    } catch (_) {}
  }
  return null;
}

async function handleSpot(res) {
  // 1) Metalprice (rápido y estable)
  const mp = await metalpriceLatest();

  // 2) GoldAPI por si querés comparar o si metalprice falla
  const gold = await goldapiSpotOne("XAU");
  const silver = await goldapiSpotOne("XAG");

  // elegimos la mejor fuente disponible
  const out = {
    provider: mp ? "metalprice" : "goldapi",
    gold: { price: mp?.gold ?? gold ?? null },
    silver: { price: mp?.silver ?? silver ?? null },
    ts: mp?.ts ?? Date.now(),
  };

  send(res, 200, out);
}

async function handleCandles(res, symbol, tf) {
  // Intentamos velas reales desde GoldAPI.
  const got = await goldapiCandles(symbol, tf, 240);
  if (got?.candles?.length) {
    return send(res, 200, { real: true, provider: got.provider, data: got.candles });
  }
  // No hay velas intradía en tu plan -> devolvemos vacío y que el front genere
  return send(res, 200, { real: false, provider: "synthetic", data: [] });
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/api/spot") {
      return await handleSpot(res);
    }
    if (url.pathname === "/api/candles") {
      const symbol = url.searchParams.get("metal") || "XAU"; // XAU | XAG
      const tf = url.searchParams.get("tf") || "1m";
      return await handleCandles(res, symbol, tf);
    }
    // default: 404 JSON
    send(res, 404, { ok: false, error: "NOT_FOUND" });
  } catch (e) {
    send(res, 500, { ok: false, error: String(e?.message || e) });
  }
};
