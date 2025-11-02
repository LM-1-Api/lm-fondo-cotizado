// api/spot.js

export default async function handler(req, res) {
  const apiKey = process.env.GOLDAPI_KEY; // ponés la key en Vercel

  // si no hay key, devolvemos algo para que el front no muera
  if (!apiKey) {
    return res.status(200).json({
      gold: { price: 4002.4 },
      silver: { price: 48.67 },
      source: "fallback-no-key"
    });
  }

  try {
    // ORO
    const goldRes = await fetch("https://www.goldapi.io/api/XAU/USD", {
      headers: {
        "x-access-token": apiKey,
        "Content-Type": "application/json"
      }
    });
    const goldJson = await goldRes.json();

    // PLATA
    const silverRes = await fetch("https://www.goldapi.io/api/XAG/USD", {
      headers: {
        "x-access-token": apiKey,
        "Content-Type": "application/json"
      }
    });
    const silverJson = await silverRes.json();

    return res.status(200).json({
      gold: { price: Number(goldJson.price) },
      silver: { price: Number(silverJson.price) },
      source: "goldapi"
    });
  } catch (err) {
    console.error("GoldAPI error:", err);
    return res.status(200).json({
      gold: { price: 4002.4 },
      silver: { price: 48.67 },
      source: "fallback-error"
    });
  }
}
