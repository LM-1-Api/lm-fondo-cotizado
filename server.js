import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(__dirname));

// tu key de goldapi
const GOLDAPI_KEY = process.env.GOLDAPI_KEY || "goldapi-3szmoxgsmgo1ms8o-io";

app.get("/api/spot", async (req, res) => {
  try {
    const metals = ["XAU", "XAG"];
    const out = {};
    for (const metal of metals) {
      const resp = await fetch(`https://www.goldapi.io/api/${metal}/USD`, {
        headers: {
          "x-access-token": GOLDAPI_KEY,
          "Accept": "application/json"
        }
      });

      if (!resp.ok) {
        out[metal] = {
          metal,
          price: metal === "XAU" ? 2350 : 28,
          source: "fallback"
        };
      } else {
        const json = await resp.json();
        out[metal] = {
          metal,
          price: json.price,
          change: json.ch,
          change_pct: json.chp,
          ts: json.timestamp ? json.timestamp * 1000 : Date.now(),
          source: "goldapi.io"
        };
      }
    }

    res.json({
      base: "USD",
      gold: out["XAU"],
      silver: out["XAG"]
    });
  } catch (err) {
    console.error("error /api/spot", err);
    res.status(500).json({ error: "goldapi failed" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

export default app;
