const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

// Health check route
app.get("/", (req, res) => {
  res.send("API is running");
});

// Main URL check route
app.post("/check", async (req, res) => {
  try {
    const urls = req.body.urls;

    if (!urls || !Array.isArray(urls)) {
      return res.json([{ error: "Invalid input: URLs missing" }]);
    }

    const results = [];

    for (const url of urls) {
      try {
        const response = await axios.get(url, {
          maxRedirects: 5,
          timeout: 10000,
          validateStatus: () => true // 🔥 prevents axios from throwing on 4xx
        });

        const statusCode = response.status;
        const body = response.data;

        // DOI-specific detection
        if (
          typeof body === "string" &&
          body.includes("DOI Not Found")
        ) {
          results.push({ url, status: "Invalid DOI" });
          continue;
        }

        // Status classification
        if (statusCode === 200) {
          results.push({ url, status: "Working (200)" });
        } else if (statusCode === 403) {
          results.push({ url, status: "Working (403 - Restricted)" });
        } else if (statusCode === 404) {
          results.push({ url, status: "Fail (404)" });
        } else {
          results.push({ url, status: "Fail (" + statusCode + ")" });
        }

      } catch (err) {
        const code = err.response?.status || "DOWN";
        results.push({ url, status: "Fail (" + code + ")" });
      }
    }

    return res.json(results);

  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
