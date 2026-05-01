const express = require("express");
const { gotScraping } = require("got-scraping");
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
async function performUrlCheck(url) {
  try {
    // got-scraping automatically handles browser-like headers and TLS fingerprints
    const response = await gotScraping.get(url, {
      timeout: { request: 20000 }, // Increased for slow academic servers
      retry: { limit: 1 },
      followRedirect: true
    });

    return {
      url,
      status: response.statusCode === 200 ? "✅ Working" : `❌ Fail (${response.statusCode})`
    };
  } catch (err) {
    // Catch specific HTTP errors (like 403, 404, 500)
    if (err.response) {
      return { url, status: `❌ Fail (${err.response.statusCode})` };
    }
    // Catch timeouts or network issues
    const errorMsg = err.code === 'ETIMEDOUT' ? "⚠️ Timeout" : "⚠️ Down";
    return { url, status: errorMsg };
  }
}

/* ================= CHECK ENDPOINT ================= */
app.post("/check", async (req, res) => {
  const { urls, sendEmail } = req.body;

  try {
    const results = await Promise.all(urls.map(url => performUrlCheck(url)));

    if (sendEmail && alertEmail) {
      const message = results.map(r => `${r.url} -> ${r.status}`).join("\n");
      try {
        await transporter.sendMail({
          from: '"URL Monitor" <laxshlax@gmail.com>',
          to: alertEmail,
          subject: manualSubject,
          text: message
        });
      } catch (err) {
        console.error("Email failed:", err.message);
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("Check failed:", err);
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
    if (!u.status.includes("Working")) hasFailure = true;
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
  } catch (err) {
    console.error("Monitor email failed:", err.message);
  }
};

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
