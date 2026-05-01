const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

/* ================= STATE ================= */
let activeUrls = [];
let alertEmail = "laxshlax@gmail.com";

let manualSubject = "Manual URL Check Report";
let monitorSubject = "⚠️ URL Alert";

let intervalMs = 3600000;

/* ================= CONFIG ================= */
// Common headers to mimic a real Chrome browser
const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.5",
  "Referer": "https://www.google.com/",
  "Connection": "keep-alive",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0"
};

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "laxshlax@gmail.com",
    pass: process.env.EMAIL_PASS
  }
});

/* ================= HEALTH ================= */
app.get("/", (req, res) => res.send("OK"));

/* ================= CHECK LOGIC ================= */
// Extracted helper function for re-use in manual and monitor checks
async function performUrlCheck(url) {
  try {
    const r = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 15000,           // Increased timeout for slower journal servers
      maxRedirects: 10,         // Ensure we follow DOI redirects
      validateStatus: () => true // Allow us to handle 403, 404, etc. manually
    });

    return {
      url,
      status: r.status === 200 ? "✅ Working" : `❌ Fail (${r.status})`
    };
  } catch (err) {
    // Check if it's a specific timeout or a general connection error
    const msg = err.code === 'ECONNABORTED' ? "⚠️ Timeout" : "⚠️ Down";
    return { url, status: msg };
  }
}

/* ================= CHECK ENDPOINT ================= */
app.post("/check", async (req, res) => {
  const { urls, sendEmail } = req.body;

  try {
    const results = await Promise.all(urls.map(url => performUrlCheck(url)));

    // EMAIL NOW
    if (sendEmail && alertEmail) {
      const message = results.map(r => `${r.url} -> ${r.status}`).join("\n");

      try {
        await transporter.sendMail({
          from: '"URL Monitor" <laxshlax@gmail.com>',
          to: alertEmail,
          subject: manualSubject,
          text: message
        });
        console.log("Manual email sent");
      } catch (err) {
        console.error("Manual email failed:", err.message);
      }
    }

    res.json({ results });

  } catch (err) {
    console.error("Endpoint check failed:", err);
    res.status(500).json({ error: "Check failed" });
  }
});

/* ================= EMAIL CONFIG ================= */
app.post("/set-email", (req, res) => {
  alertEmail = req.body.email;
  res.json({ message: "Email updated" });
});

app.post("/set-subjects", (req, res) => {
  const { manual, monitor } = req.body;
  if (manual) manualSubject = manual;
  if (monitor) monitorSubject = monitor;
  res.json({ message: "Subjects updated" });
});

/* ================= INTERVAL ================= */
let intervalHandle;

function startScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(checkAndEmail, intervalMs);
}

app.post("/set-interval", (req, res) => {
  intervalMs = req.body.minutes * 60000;
  startScheduler();
  res.json({ message: "Interval updated" });
});

/* ================= URL MGMT ================= */
app.get("/urls", (req, res) => {
  res.json({
    interval: intervalMs / 60000,
    email: alertEmail,
    manualSubject,
    monitorSubject,
    urls: activeUrls
  });
});

app.post("/urls/add", (req, res) => {
  const { url } = req.body;

  if (!url || activeUrls.find(u => u.url === url)) {
    return res.status(400).json({ error: "Duplicate or invalid" });
  }

  activeUrls.push({
    url,
    status: "Not checked",
    lastChecked: null,
    lastEmailSent: null
  });

  res.json({ message: "Added" });
});

app.post("/urls/remove", (req, res) => {
  activeUrls = activeUrls.filter(u => u.url !== req.body.url);
  res.json({ message: "Removed" });
});

/* ================= MONITOR ================= */
const checkAndEmail = async () => {
  if (!activeUrls.length) return;

  let hasFailure = false;

  for (const u of activeUrls) {
    const result = await performUrlCheck(u.url);
    u.status = result.status;
    u.lastChecked = new Date().toLocaleString();

    if (!u.status.includes("Working")) {
      hasFailure = true;
    }
  }

  if (!hasFailure) return;

  const message = activeUrls.map(r => `${r.url} -> ${r.status}`).join("\n");

  try {
    await transporter.sendMail({
      from: '"URL Monitor" <laxshlax@gmail.com>',
      to: alertEmail,
      subject: monitorSubject,
      text: message
    });

    const now = new Date().toLocaleString();
    activeUrls.forEach(u => {
      if (!u.status.includes("Working")) u.lastEmailSent = now;
    });

    console.log("Monitoring email sent");

  } catch (err) {
    console.error("Monitoring email failed:", err.message);
  }
};

/* ================= CRON / MANUAL TRIGGER ================= */
app.get("/check-monitor", async (req, res) => {
  await checkAndEmail();
  res.send("done");
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  startScheduler();
});
