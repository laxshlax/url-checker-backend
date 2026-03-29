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
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: "Invalid input" });
  }

  const results = [];

  for (const url of urls) {
    try {
      const resp = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true
      });

      results.push({
        url,
        status: resp.status === 200
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

  res.json(results);
});

/* ================= EMAIL SET ================= */
app.post("/set-email", (req, res) => {
  const { email } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" });
  }

  alertEmail = email;
  res.json({ message: "Email updated successfully" });
});

/* ================= INTERVAL ================= */
let intervalMs = 3600000;
let intervalHandle = null;

function startScheduler() {
  if (intervalHandle) clearInterval(intervalHandle);

  intervalHandle = setInterval(checkAndEmail, intervalMs);
  console.log("Interval:", intervalMs / 60000, "minutes");
}

app.post("/set-interval", (req, res) => {
  const { minutes } = req.body;

  if (!minutes || minutes < 1) {
    return res.status(400).json({ error: "Invalid minutes" });
  }

  intervalMs = minutes * 60000;
  startScheduler();

  res.json({ message: `Interval set to ${minutes} minutes` });
});

/* ================= URL MGMT ================= */
app.get("/urls", (req, res) => res.json(activeUrls));

app.post("/urls/add", (req, res) => {
  const { url } = req.body;

  if (url && !activeUrls.includes(url)) {
    activeUrls.push(url);
    return res.json({ message: "Added" });
  }

  res.status(400).json({ error: "Invalid or duplicate URL" });
});

app.post("/urls/remove", (req, res) => {
  const { url } = req.body;
  activeUrls = activeUrls.filter(u => u !== url);
  res.json({ message: "Removed" });
});

/* ================= SCHEDULER ================= */
const checkAndEmail = async () => {
  if (activeUrls.length === 0) return;

  const results = [];

  for (const url of activeUrls) {
    try {
      const resp = await axios.get(url, {
        timeout: 10000,
        validateStatus: () => true
      });

      results.push({
        url,
        status: resp.status === 200
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

  const hasFailure = results.some(r => !r.status.includes("Working"));

  if (!hasFailure) return; // only send if problem

  const message = results.map(r => `${r.url} -> ${r.status}`).join("\n");

  try {
    await transporter.sendMail({
      from: '"URL Monitor" <laxshlax@gmail.com>',
      to: alertEmail,
      subject: "⚠️ URL Alert",
      text: message
    });

    console.log("Email sent");
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
