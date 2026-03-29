const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   IN-MEMORY STORE
========================= */
let activeUrls = [];

/* =========================
   EMAIL SETUP (OPTIONAL)
========================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "laxshlax@gmail.com",
    pass: process.env.EMAIL_PASS // Use App Password
  }
});

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.send("Monitoring Service is Active");
});

/* =========================
   CHECK ROUTE (MAIN FIX)
========================= */
app.post("/check", async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Invalid input" });
  }

  console.log("Incoming URLs:", urls);

  const results = [];

  for (const url of urls) {
    try {
      const resp = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true
      });

      results.push({
        url,
        status:
          resp.status === 200
            ? "✅ Working"
            : `❌ Fail (${resp.status})`
      });

    } catch (err) {
      results.push({
        url,
        status: "⚠️ Down/Timeout"
      });
    }
  }

  res.json(results);
});

/* =========================
   URL MANAGEMENT (OPTIONAL)
========================= */

// Get all URLs
app.get("/urls", (req, res) => {
  res.json(activeUrls);
});

// Add URL
app.post("/urls/add", (req, res) => {
  const { url } = req.body;

  if (url && !activeUrls.includes(url)) {
    activeUrls.push(url);
    return res.json({ message: "Added", list: activeUrls });
  }

  res.status(400).json({ error: "Invalid or duplicate URL" });
});

// Remove URL
app.post("/urls/remove", (req, res) => {
  const { url } = req.body;
  activeUrls = activeUrls.filter(u => u !== url);
  res.json({ message: "Removed", list: activeUrls });
});

/* =========================
   SCHEDULED MONITOR (1 HOUR)
========================= */
const checkAndEmail = async () => {
  if (activeUrls.length === 0) return;

  console.log("🚀 Scheduled check:", activeUrls);

  const results = [];

  for (const url of activeUrls) {
    try {
      const resp = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true
      });

      results.push({
        url,
        status:
          resp.status === 200
            ? "✅ Working"
            : `❌ Fail (${resp.status})`
      });

    } catch {
      results.push({
        url,
        status: "⚠️ Down/Timeout"
      });
    }
  }

  const message = results.map(r => `${r.url} -> ${r.status}`).join("\n");

  try {
    await transporter.sendMail({
      from: '"URL Monitor" <laxshlax@gmail.com>',
      to: "laxshlax@gmail.com",
      subject: `URL Report (${new Date().toLocaleTimeString()})`,
      text: message
    });

    console.log("📧 Email sent");
  } catch (err) {
    console.error("Email failed:", err.message);
  }
};

// run as per html
let intervalMs = 3600000;
let intervalHandle = null;

function startScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);

  intervalHandle = setInterval(checkAndEmail, intervalMs);

  console.log("⏱ Scheduler set to", intervalMs / 60000, "minutes");
}

// Start initially
startScheduler();

// API to update interval
app.post("/set-interval", (req, res) => {
  const { minutes } = req.body;

  if (!minutes || minutes < 1) {
    return res.status(400).json({ error: "Invalid minutes" });
  }

  intervalMs = minutes * 60000;
  startScheduler();

  res.json({ message: `Interval updated to ${minutes} minutes` });
});
/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
