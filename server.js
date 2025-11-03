// server.js
// Express server para Vercel: sirve index + IMG_2975.png y expone /api/spot con Metalprice

const express = require("express");
const path = require("path");
const fetch = require("node-fetch");

const app = express();

// ====== CONFIG: tus claves Metalprice ======
const METALPRICE_KEYS = [
  // Podés dejarlas acá o ponerlas como variables de entorno en Vercel
  process.env.METALPRICE_KEY_1 || "a06ea2dec055d0e31754673ee846dff2",
  process.env.METALPRICE_KEY_2 || "386d0a353a350f94eaf305714cde7c46",
].filter(Boolean);

// Servir archivos estáticos del root (para que cargue /IMG_2975.png sin 404)
app.use(express.static(path.join(__dirname)));

// Página principal
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Util: convertir rates a USD/oz si la API devuelve USD→XAU (valor < 1)
function toUsdPerOz(rate) {
  if (!rate) return null;
  return rate > 5 ? rate : 1 / rate; // si es 0.00025 → 1/0.00025 = 4000
}

// Hit Metalprice (intenta con ambas keys)
async function getMetalpriceSpot() {
  let lastError = null;
  for (const key of METALPRICE_KEYS) {
    try {
      const url =
        `https://api.metalpriceapi.com/v1/latest?api_key=${key}&base=USD&currencies=XAU,XAG`;
      const r = await fetch(url, { timeout: 10000 });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();

      const ts = (j.timestamp ? j.timestamp * 1000 : Date.now());
      const xauRate = j.rates?.XAU;
      const xagRate = j.rates?.XAG;

      const goldUsd = toUsdPerOz(xauRate);
      const silverUsd = toUsdPerOz(xagRate);

      if (!goldUsd || !silverUsd) throw new Error("Rates incompletos");

      return {
        gold: { price: goldUsd, ts },
        silver: { price: silverUsd, ts },
        provider: "metalprice",
      };
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error("Metalprice sin respuesta");
}

// Endpoint consumido por el frontend
app.get("/api/spot", async (_req, res) => {
  try {
    const spot = await getMetalpriceSpot();
    res.set("Cache-Control", "no-store");
    res.json(spot);
  } catch (e) {
    res.status(502).json({ error: "Spot unavailable", detail: String(e) });
  }
});

// Export para Vercel
module.exports = app;
