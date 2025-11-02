// server.js
const express = require("express");
const app = express();

const GOLDAPI_KEY = "goldapi-3szmoxgsmgo1ms8o-io";

app.get("/api/spot", async (req, res) => {
  try {
    // Oro
    const g = await fetch("https://www.goldapi.io/api/XAU/USD", {
      headers: {
        "x-access-token": GOLDAPI_KEY,
        "Content-Type": "application/json"
      }
    });
    const gold = await g.json();

    // Plata
    const s = await fetch("https://www.goldapi.io/api/XAG/USD", {
      headers: {
        "x-access-token": GOLDAPI_KEY,
        "Content-Type": "application/json"
      }
    });
    const silver = await s.json();

    res.status(200).json({
      ok: true,
      gold: {
        price: Number(gold.price) || 4000
      },
      silver: {
        price: Number(silver.price) || 50
      }
    });
  } catch (err) {
    console.log("API error", err);
    res.status(200).json({
      ok: false,
      gold: { price: 4000 },
      silver: { price: 50 }
    });
  }
});

// necesario para Vercel
module.exports = app;
