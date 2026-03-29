const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

app.post("/check", async (req, res) => {
  const { urls } = req.body;
  const results = [];

  for (let url of urls) {
    try {
      const response = await axios.get(url, {
        maxRedirects: 5,
        timeout: 10000
      });

      const text = response.data;

      if (typeof text === "string" && text.includes("DOI Not Found")) {
        results.push({ url, status: "Invalid DOI" });
      } else {
        results.push({ url, status: "Working (" + response.status + ")" });
      }

    } catch (e) {
      const code = e.response?.status || "DOWN";
      results.push({ url, status: "Fail (" + code + ")" });
    }
  }

  res.json(results);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log("Server running"));