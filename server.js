// server.js
const express = require("express");
const path = require("path");
const app = express();

// ✅ Servir archivos estáticos del root (index.html, IMG_2975.png, etc.)
app.use(express.static(__dirname));

/** ------------ GOLDAPI ------------- **/
const GOLDAPI_KEY =
  process.env.GOLDAPI_KEY || "goldapi-3szmoxgsmgo1ms8o-io";
const BASE = "https://www.goldapi.io/api";

async function fetchMetal(symbol, fiat = "USD") {
  const url = `${BASE}/${symbol}/${fiat}`;
  const r = await fetch(url, {
    headers: {
      "x-access-token": GOLDAPI_KEY,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`GoldAPI ${symbol} ${r.status}`);
  const j = await r.json();
  // distintos planes devuelven price/ask/last; tomamos el que esté
  const price = Number(j.price ?? j.ask ?? j.last ?? j.ask_price);
  if (!price) throw new Error(`GoldAPI ${symbol} sin precio`);
  return { symbol: `${symbol}/USD`, price };
}

app.get("/api/spot", async (_req, res) => {
  try {
    const [gold, silver] = await Promise.all([
      fetchMetal("XAU"),
      fetchMetal("XAG"),
    ]);
    res.setHeader("Cache-Control", "no-store");
    res.json({ gold, silver, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res
      .status(200)
      .json({ error: true, message: String(err), updatedAt: new Date().toISOString() });
  }
});

/** ------------ RUTA HOME ------------- **/
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

module.exports = app;
