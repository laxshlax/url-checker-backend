const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

/* ================= STORE ================= */
let activeUrls = [];
let alertEmail = "laxshlax@gmail.com";

let manualSubject = "Manual URL Check Report";
let monitorSubject = "⚠️ URL Alert";

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

/* ================= MANUAL CHECK ================= */
app.post("/check", async (req, res) => {
  const { urls, sendEmail } = req.body;

  try {
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          const resp = await axios.get(url, {
            timeout: 8000,
            validateStatus: () => true
          });

          return {
            url,
            status:
              resp.status === 200
                ? "✅ Working"
                : `❌ Fail (${resp.status})`
          };
        } catch {
          return { url, status: "⚠️ Down/Timeout" };
        }
      })
    );

    // Send email for manual check
    if (sendEmail) {
      const message = results.map(r => `${r.url} -> ${r.status}`).join("\n");

      await transporter.sendMail({
        from: '"URL Monitor" <laxshlax@gmail.com>',
        to: alertEmail,
        subject: manualSubject,
        text: message
      });
    }

    res.json({ results });

  } catch (err) {
    console.error("Manual check error:", err.message);
    res.status(500).json({ error: "Check failed" });
  }
});

/* ================= CRON MONITOR (NEW) ================= */
app.get("/check-monitor", async (req, res) => {
  console.log("🔔 External monitor trigger received");
  await checkAndEmail();
  res.send("Monitoring executed");
});

/* ================= SUBJECTS ================= */
app.post("/set-subjects", (req, res) => {
  const { manual, monitor } = req.body;

  if (manual) manualSubject = manual;
  if (monitor) monitorSubject = monitor;

  res.json({ message: "Subjects updated" });
});

/* ================= EMAIL ================= */
app.post("/set-email", (req, res) => {
  alertEmail = req.body.email;
  res.json({ message: "Email updated" });
});

/* ================= INTERVAL (OPTIONAL) ================= */
let intervalMs = 3600000;
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

/* ================= URL MANAGEMENT ================= */
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
    return res.status(400).json({ error: "Invalid or duplicate URL" });
  }

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

/* ================= CORE MONITOR LOGIC ================= */
const checkAndEmail = async () => {
  if (!activeUrls.length) {
    console.log("No URLs to monitor");
    return;
  }

  console.log("Running monitoring check...");

  let hasFailure = false;

  for (const item of activeUrls) {
    try {
      const resp = await axios.get(item.url, {
        timeout: 8000,
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

  // Only send email if failure exists
  if (!hasFailure) {
    console.log("All URLs OK - no email sent");
    return;
  }

  const message = activeUrls
    .map(r => `${r.url} -> ${r.status}`)
    .join("\n");

  try {
    await transporter.sendMail({
      from: '"URL Monitor" <laxshlax@gmail.com>',
      to: alertEmail,
      subject: monitorSubject,
      text: message
    });

    const now = new Date().toLocaleString();

    activeUrls.forEach(u => {
      if (!u.status.includes("Working")) {
        u.lastEmailSent = now;
      }
    });

    console.log("📧 Alert email sent");

  } catch (err) {
    console.error("Email failed:", err.message);
  }
};

/* ================= START ================= */
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log("Server running on", PORT);
  startScheduler(); // works only if server stays awake
});
