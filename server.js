const express = require("express");
const axios = require("axios");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();
app.use(cors());
app.use(express.json());

let activeUrls = [];
let alertEmail = "laxshlax@gmail.com";

/* EMAIL */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "laxshlax@gmail.com",
    pass: process.env.EMAIL_PASS
  }
});

/* CHECK */
app.post("/check", async (req, res) => {
  const { urls, sendEmail } = req.body;

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const r = await axios.get(url, { timeout: 8000, validateStatus: () => true });
        return { url, status: r.status === 200 ? "✅ Working" : `❌ Fail (${r.status})` };
      } catch {
        return { url, status: "⚠️ Down/Timeout" };
      }
    })
  );

  if (sendEmail) {
    const message = results.map(r => `${r.url} -> ${r.status}`).join("\n");
    await transporter.sendMail({
      from: "URL Monitor",
      to: alertEmail,
      subject: "Manual Check",
      text: message
    });
  }

  res.json({ results });
});

/* ADD URL (SAFE) */
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

/* GET */
app.get("/urls", (req, res) => {
  res.json({ urls: activeUrls });
});

/* REMOVE */
app.post("/urls/remove", (req, res) => {
  activeUrls = activeUrls.filter(u => u.url !== req.body.url);
  res.json({ message: "Removed" });
});

/* MONITOR */
const checkAndEmail = async () => {
  if (!activeUrls.length) return;

  let hasFailure = false;

  for (const u of activeUrls) {
    try {
      const r = await axios.get(u.url, { timeout: 8000, validateStatus: () => true });
      u.status = r.status === 200 ? "✅ Working" : `❌ Fail (${r.status})`;
    } catch {
      u.status = "⚠️ Down/Timeout";
    }

    u.lastChecked = new Date().toLocaleString();
    if (!u.status.includes("Working")) hasFailure = true;
  }

  if (!hasFailure) return;

  const message = activeUrls.map(r => `${r.url} -> ${r.status}`).join("\n");

  await transporter.sendMail({
    from: "URL Monitor",
    to: alertEmail,
    subject: "⚠️ Alert",
    text: message
  });

  const now = new Date().toLocaleString();
  activeUrls.forEach(u => {
    if (!u.status.includes("Working")) u.lastEmailSent = now;
  });
};

/* CRON */
app.get("/check-monitor", async (req, res) => {
  await checkAndEmail();
  res.send("done");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT);
