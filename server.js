import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fetch from "node-fetch";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;
const GOLDAPI_KEY = process.env.GOLDAPI_KEY || "goldapi-3szmoxgsmgo1ms8o-io";

app.get("/api/spot", async (req, res) => {
  try {
    const metals = ["XAU", "XAG"];
    const out = {};
    for (const metal of metals) {
      const r = await fetch(`https://www.goldapi.io/api/${metal}/USD`, {
        headers: {
          "x-access-token": GOLDAPI_KEY,
          "Accept": "application/json"
        }
      });
      if (!r.ok) {
        out[metal] = {
          symbol: metal,
          price: metal === "XAU" ? 2350 : 28,
          source: "fallback"
        };
      } else {
        const d = await r.json();
        out[metal] = {
          symbol: metal,
          price: d.price,
          ts: d.timestamp ? d.timestamp * 1000 : Date.now(),
          source: "goldapi"
        };
      }
    }
    res.json({
      base: "USD",
      gold: out["XAU"],
      silver: out["XAG"]
    });
  } catch (e) {
    res.status(500).json({ error: "spot error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log("LM Fondo Cotizado running on port", PORT);
});
