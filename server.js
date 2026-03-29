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

/* ================= CHECK ================= */
app.post("/check", async (req, res) => {
  const { urls, sendEmail } = req.body;

  try {
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const r = await axios.get(url, {
            timeout: 8000,
            validateStatus: () => true
          });

          return {
            url,
            status: r.status === 200 ? "✅ Working" : `❌ Fail (${r.status})`
          };
        } catch {
          return { url, status: "⚠️ Down/Timeout" };
        }
      })
    );

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
    try {
      const r = await axios.get(u.url, {
        timeout: 8000,
        validateStatus: () => true
      });

      u.status = r.status === 200
        ? "✅ Working"
        : `❌ Fail (${r.status})`;

    } catch {
      u.status = "⚠️ Down/Timeout";
    }

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

    console.log("Monitoring email sent");

  } catch (err) {
    console.error("Monitoring email failed:", err.message);
  }
};

/* ================= CRON ================= */
app.get("/check-monitor", async (req, res) => {
  await checkAndEmail();
  res.send("done");
});

/* ================= START ================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running");
  startScheduler();
});
