const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// EMAIL CONFIGURATION
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: "laxshlax@gmail.com",
    pass: process.env.EMAIL_PASS
  },
  connectionTimeout: 20000 
});

// Verify connection on startup
transporter.verify((error) => {
  if (error) console.log("❌ Mail Status: " + error.message);
  else console.log("✅ Mail Status: Ready to send");
});

app.get("/", (req, res) => res.send("API is Live"));

// URL CHECK ROUTE
app.post("/check", async (req, res) => {
  const { urls } = req.body;
  const results = [];
  for (const url of urls) {
    try {
      const resp = await axios.get(url, { timeout: 10000, validateStatus: () => true });
      results.push({ url, status: resp.status === 200 ? "Working (200)" : `Fail (${resp.status})` });
    } catch (err) {
      results.push({ url, status: "Down/Error" });
    }
  }
  res.json(results);
});

// EMAIL ROUTE
app.post("/send-email", async (req, res) => {
  const { email, results } = req.body;
  const message = results.map(r => `${r.url}: ${r.status}`).join("\n");
  try {
    await transporter.sendMail({
      from: '"URL Checker" <laxshlax@gmail.com>',
      to: email,
      subject: "URL Results",
      text: message
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server on ${PORT}`));
