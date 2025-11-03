// /api/spot.js
// Devuelve: { ok, symbol, price, ts, raw }

module.exports = async (req, res) => {
  try {
    const u = new URL(req.url, "http://localhost");
    const symbol = (u.searchParams.get("symbol") || "XAUUSD").toUpperCase();
    const pairMap = { XAUUSD: "XAU/USD", XAGUSD: "XAG/USD" };
    const pair = pairMap[symbol];
    if (!pair) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      return res.end(JSON.stringify({ ok: false, error: "Símbolo inválido" }));
    }

    const key = process.env.GOLDAPI_KEY;
    if (!key) throw new Error("Falta GOLDAPI_KEY en Vercel");

    const r = await fetch(`https://www.goldapi.io/api/${pair}`, {
      headers: {
        "x-access-token": key,
        "Accept": "application/json"
      },
      cache: "no-store"
    });
    const j = await r.json().catch(() => ({}));

    if (!r.ok || j.error) {
      throw new Error(j?.message || j?.error || r.statusText || "GoldAPI fallo");
    }

    // GoldAPI entrega varios campos; priorizamos 'price'
    const price = Number(j.price ?? j.last ?? j.ask ?? j.bid);
    const ts = (j.timestamp ? j.timestamp * 1000 : Date.now());

    res.statusCode = 200;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: true, symbol, price, ts, raw: j }));
  } catch (e) {
    // Respondemos 200 con ok:false para NO disparar la página 500 de Vercel
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: e?.message || String(e) }));
  }
};
