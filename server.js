// server.js
// endpoint: /api/spot
// usa tu key de GoldAPI

const GOLDAPI_KEY = "goldapi-3szmoxgsmgo1ms8o-io"; // tu key

async function getMetal(symbol) {
  const url = `https://www.goldapi.io/api/${symbol}/USD`;
  const res = await fetch(url, {
    headers: {
      "x-access-token": GOLDAPI_KEY,
      "Content-Type": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`GoldAPI ${symbol} error: ${res.status}`);
  }

  const data = await res.json();
  // GoldAPI suele devolver price, prev_close_price, etc.
  // nos quedamos con price
  return {
    price: Number(data.price),
    raw: data
  };
}

module.exports = async (req, res) => {
  // solo queremos /api/spot
  if (req.url !== "/api/spot") {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not found" }));
    return;
  }

  try {
    const [gold, silver] = await Promise.all([
      getMetal("XAU"),
      getMetal("XAG")
    ]);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        gold,
        silver,
        source: "goldapi.io",
        updatedAt: new Date().toISOString()
      })
    );
  } catch (err) {
    console.error(err);
    res.statusCode = 200; // 200 para que el front no se rompa
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        gold: { price: null },
        silver: { price: null },
        error: err.message,
        updatedAt: new Date().toISOString()
      })
    );
  }
};
