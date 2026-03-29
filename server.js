const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Test route
app.get("/", (req, res) => {
  res.send("API working");
});

// MAIN ROUTE
app.post("/check", async (req, res) => {
  try {
    console.log("Incoming body:", req.body);

    const urls = req.body.urls;

    if (!urls || !Array.isArray(urls)) {
      return res.json([{ error: "No URLs received" }]);
    }

    const results = [];

    for (const url of urls) {
      try {
        const response = await axios.get(url, {
          maxRedirects: 5,
          timeout: 10000
        });

        if (
          typeof response.data === "string" &&
          response.data.includes("DOI Not Found")
        ) {
          results.push({ url, status: "Invalid DOI" });
        } else {
          results.push({ url, status: "Working (" + response.status + ")" });
        }

      } catch (err) {
        const code = err.response?.status;

if (code === 403) {
  results.push({ url, status: "Working (403 - Restricted)" });
} else if (code === 404) {
  results.push({ url, status: "Fail (404)" });
} else {
  results.push({ url, status: "Fail (" + (code || "DOWN") + ")" });
}
      }
    }

    console.log("Returning:", results);

    return res.json(results); // 🔥 CRITICAL

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server crashed" });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running on port", PORT));
