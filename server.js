const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors());
app.use(express.json());

/* =========================
   EMAIL CONFIGURATION (GMAIL PRESET)
========================= */
// 'service: gmail' is the most stable way to connect from Render
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: "laxshlax@gmail.com",
    pass: process.env.EMAIL_PASS // Must be a 16-character App Password
  },
  // Increased timeouts to handle cloud network latency
  connectionTimeout: 20000, 
  greetingTimeout: 20000,
  socketTimeout: 20000
});

// Verify connection configuration on startup
// CHECK YOUR RENDER LOGS FOR THESE MESSAGES
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ SMTP Connection Error:", error.message);
  } else {
    console.log("✅ Success: Server is ready to take our messages");
  }
});

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
      return res.status(400).json({ error: "Invalid input: URLs missing" });
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
          results.push({ url, status: `Fail (${statusCode})` });
        }

      } catch (err) {
        const code = err.response?.status || "DOWN";
        results.push({ url, status: `Fail (${code})` });
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

  if (!email || !results || !Array.isArray(results)) {
    return res.status(400).json({ error: "Missing email or valid results array" });
  }

  try {
    const message = results
      .map(r => `${r.url} → ${r.status}`)
      .join("\n");

    const mailOptions = {
      from: `"URL Checker" <laxshlax@gmail.com>`,
      to: email,
      subject: "URL Check Results",
      text: `Here are your URL check results:\n\n${message}`
    };

    const info = await transporter.sendMail(mailOptions);
    console.log("📧 Email sent: " + info.response);
    
    return res.json({ success: true, messageId: info.messageId });

  } catch (err) {
    console.error("📧 EMAIL SENDING ERROR:", err.message);
    return res.status(500).json({ 
      error: "Email failed", 
      details: err.message 
    });
  }
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
