const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

let activeUrls = [];
let alertEmail = "laxshlax@gmail.com";

/* ================= EMAIL ================= */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "laxshlax@gmail.com",
    pass: process.env.EMAIL_PASS
  }
});

/* ================= HEALTH ================= */
app.get("/", (req, res) => {
  res.send("Monitoring Service is Active");
});

/* ================= CHECK ================= */
app.post("/check", async (req, res) => {
  const { urls, sendEmail } = req.body;

  const results = [];
  let hasFailure = false;

  for (const url of urls) {
    try {
      const resp = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true
      });

      const status = resp.status === 200
        ? "✅ Working"
        : `❌ Fail (${resp.status})`;

      if (!status.includes("Working")) hasFailure = true;

      results.push({ url, status });

    } catch {
      results.push({ url, status: "⚠️ Down/Timeout" });
      hasFailure = true;
    }
  }

  // Email for manual check
  if (sendEmail) {
    const message = results.map(r => `${r.url} -> ${r.status}`).join("\n");

    try {
      await transporter.sendMail({
        from: '"URL Monitor" <laxshlax@gmail.com>',
        to: alertEmail,
        subject: "Manual URL Check Report",
        text: message
      });
    } catch (err) {
      console.error("Manual email failed:", err.message);
    }
  }

  res.json({ results });
});

/* ================= EMAIL SET ================= */
app.post("/set-email", (req, res) => {
  const { email } = req.body;
  alertEmail = email;
  res.json({ message: "Email updated" });
});

/* ================= INTERVAL ================= */
let intervalMs = 3600000;
let intervalHandle;

function startScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);
  intervalHandle = setInterval(checkAndEmail, intervalMs);
}

app.post("/set-interval", (req, res) => {
  const { minutes } = req.body;
  intervalMs = minutes * 60000;
  startScheduler();
  res.json({ message: "Interval updated" });
});

/* ================= URL MGMT ================= */
app.get("/urls", (req, res) => {
  res.json({
    interval: intervalMs / 60000,
    email: alertEmail,
    urls: activeUrls
  });
});

app.post("/urls/add", (req, res) => {
  const { url } = req.body;

  activeUrls.push({
    url,
    status: "Not checked yet",
    lastChecked: null,
    lastEmailSent: null
  });

  res.json({ message: "Added" });
});

app.post("/urls/remove", (req, res) => {
  const { url } = req.body;
  activeUrls = activeUrls.filter(u => u.url !== url);
  res.json({ message: "Removed" });
});

/* ================= SCHEDULER ================= */
const checkAndEmail = async () => {
  if (activeUrls.length === 0) return;

  let hasFailure = false;

  for (const item of activeUrls) {
    try {
      const resp = await axios.get(item.url, {
        timeout: 10000,
        validateStatus: () => true
      });

      item.status = resp.status === 200
        ? "✅ Working"
        : `❌ Fail (${resp.status})`;

    } catch {
      item.status = "⚠️ Down/Timeout";
    }

    item.lastChecked = new Date().toLocaleString();

    if (!item.status.includes("Working")) {
      hasFailure = true;
    }
  }

  if (!hasFailure) return;

  const message = activeUrls.map(r => `${r.url} -> ${r.status}`).join("\n");

  try {
    await transporter.sendMail({
      from: '"URL Monitor" <laxshlax@gmail.com>',
      to: alertEmail,
      subject: "⚠️ URL Alert",
      text: message
    });

    const now = new Date().toLocaleString();

    activeUrls.forEach(u => {
      if (!u.status.includes("Working")) {
        u.lastEmailSent = now;
      }
    });

  } catch (err) {
    console.error("Email failed:", err.message);
  }
};

/* ================= START ================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
  startScheduler();
});
