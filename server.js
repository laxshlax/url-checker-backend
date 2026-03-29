const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

// --- DATA STORE (Stored in RAM) ---
let activeUrls = []; 

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: "laxshlax@gmail.com", pass: process.env.EMAIL_PASS },
});

/* =========================
   URL MANAGEMENT ROUTES
========================= */

// 1. Get all currently running URLs
app.get("/urls", (req, res) => {
  res.json(activeUrls);
});

// 2. Add a new URL to the list
app.post("/urls/add", (req, res) => {
  const { url } = req.body;
  if (url && !activeUrls.includes(url)) {
    activeUrls.push(url);
    return res.json({ message: "Added", list: activeUrls });
  }
  res.status(400).json({ error: "Invalid or duplicate URL" });
});

// 3. Remove a URL from the list
app.post("/urls/remove", (req, res) => {
  const { url } = req.body;
  activeUrls = activeUrls.filter(u => u !== url);
  res.json({ message: "Removed", list: activeUrls });
});

/* =========================
   AUTOMATED CHECKER (Every 1 Hour)
========================= */
const checkAndEmail = async () => {
  if (activeUrls.length === 0) return;

  console.log("🚀 Starting scheduled check for:", activeUrls);
  const results = [];

  for (const url of activeUrls) {
    try {
      const resp = await axios.get(url, { timeout: 10000, validateStatus: () => true });
      results.push({ url, status: resp.status === 200 ? "✅ Working" : `❌ Fail (${resp.status})` });
    } catch (err) {
      results.push({ url, status: "⚠️ Down/Timeout" });
    }
  }

  // Send the email summary
  const message = results.map(r => `${r.url} -> ${r.status}`).join("\n");
  try {
    await transporter.sendMail({
      from: '"URL Monitor" <laxshlax@gmail.com>',
      to: "laxshlax@gmail.com", // Sends to yourself
      subject: `URL Status Report (${new Date().toLocaleTimeString()})`,
      text: `Active Monitor Report:\n\n${message}`
    });
    console.log("📧 Scheduled Email Sent");
  } catch (err) {
    console.error("📧 Email failed:", err.message);
  }
};

// Run the check every 1 hour (3600000 ms)
setInterval(checkAndEmail, 3600000);

/* =========================
   START SERVER
========================= */
app.get("/", (req, res) => res.send("Monitoring Service is Active"));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Backend running on ${PORT}`));
