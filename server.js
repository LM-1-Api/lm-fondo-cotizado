// server.js
const express = require("express");
const fetch = require("node-fetch");
const app = express();

// --- CONFIG ---
const GOLDAPI_KEY = process.env.GOLDAPI_KEY || "goldapi-3szmoxgsmgo1ms8o-io";
const GOLDAPI_BASE = "https://www.goldapi.io/api";

// Pequeño helper
async function goldapiPair(pair) {
  const url = `${GOLDAPI_BASE}/${pair}`;
  const r = await fetch(url, {
    headers: {
      "x-access-token": GOLDAPI_KEY,
      "Content-Type": "application/json",
      "User-Agent": "LM-Fondo-Cotizado/1.0 (+vercel)"
    },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`GoldAPI ${pair}: ${r.status} ${txt}`);
  }
  const j = await r.json();
  // GoldAPI típica: { price, open_price, high_price, low_price, timestamp, ... }
  return {
    price: Number(j.price),
    open: Number(j.open_price ?? j.open),
    high: Number(j.high_price ?? j.high),
    low: Number(j.low_price ?? j.low),
    ts: Number(j.timestamp ?? Math.floor(Date.now() / 1000)),
    raw: j,
  };
}

// Endpoint único para frontend
app.get("/api/spot", async (_req, res) => {
  try {
    // Cachea 20s en edge para no quemar el plan
    res.set("Cache-Control", "s-maxage=20, stale-while-revalidate=40");

    const [gold, silver] = await Promise.all([
      goldapiPair("XAU/USD"),
      goldapiPair("XAG/USD"),
    ]);

    res.json({ ok: true, gold, silver, serverTime: Math.floor(Date.now() / 1000) });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false, error: String(err) });
  }
});

// Vercel: exporta como handler
module.exports = app;
