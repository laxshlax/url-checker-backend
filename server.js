const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("API is running");
});

/* =========================
   URL CHECK ROUTE
========================= */
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
          validateStatus: () => true
        });

        const statusCode = response.status;
        const body = response.data;

        // DOI detection
        if (typeof body === "string" && body.includes("DOI Not Found")) {
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
    console.error("CHECK ERROR:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

/* =========================
   EMAIL ROUTE
========================= */
app.post("/send-email", async (req, res) => {
  const { email, results } = req.body;

  if (!email || !results) {
    return res.status(400).json({ error: "Missing email or results" });
  }

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "laxshlax@gmail.com",       // 🔴 replace
        pass: "xuyy natw mkyw hxjm"           // 🔴 replace (Gmail App Password)
      }
    });

    // Format email body
    const message = results
      .map(r => `${r.url} → ${r.status}`)
      .join("\n");

    await transporter.sendMail({
      from: "laxshlax@gmail.com",
      to: email,
      subject: "URL Check Results",
      text: message
    });

    return res.json({ success: true });

  } catch (err) {
    console.error("EMAIL ERROR:", err);
    return res.status(500).json({ error: "Email failed" });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
