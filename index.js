const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const { URLSearchParams } = require("url");

const app = express();
app.use(cors());

// --- TELEGRAM ALERT CONFIG ---
const TELEGRAM_BOT_TOKEN = "8553326700:AAFZtZmaWuRILrNuZVCsHudGKDC5xvNgVEo";
const TELEGRAM_CHAT_ID = "1139897568";
let lastAlertTime = 0; // Tracks cooldown to prevent spam

// --- GLOBAL VARIABLES ---
const agent = new https.Agent({ rejectUnauthorized: false });
let CACHED_COOKIE = "";
let loginPromise = null;

// --- MEMORY CACHE ---
const BUS_CACHE = {}; 

// --- LOGIN FUNCTION ---
async function getCookie() {
  if (CACHED_COOKIE) return CACHED_COOKIE;
  if (loginPromise) return await loginPromise;

  loginPromise = (async () => {
    try {
      const res = await axios.get("https://app.bongoiot.com/jsp/quickview.jsp?param=MzQ0OTMwJkJ1cyZFTg==", {
        httpsAgent: agent,
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
        }
      });

      const rawCookies = res.headers['set-cookie'];
      if (rawCookies) {
        CACHED_COOKIE = rawCookies.map(c => c.split(';')[0]).join('; ');
        console.log("✅ Login Success!");
        
        setTimeout(() => { CACHED_COOKIE = ""; }, 20 * 60 * 1000); 

        return CACHED_COOKIE;
      }
    } catch (e) {
      console.error("❌ Login Failed:", e.message);
      return null;
    } finally {
      loginPromise = null;
    }
  })();
  return await loginPromise;
}

// --- MAIN API ENDPOINT ---
app.get("/bus-api", async (req, res) => {
  const { id, imei, type } = req.query;

  const cacheKey = `${id}`;
  const now = Date.now();
  
  if (BUS_CACHE[cacheKey] && (now - BUS_CACHE[cacheKey].timestamp < 5000)) {
      return res.json(BUS_CACHE[cacheKey].data);
  }

  const cookie = await getCookie();
  if (!cookie) return res.json({ error: "Login failed" });

  const formData = new URLSearchParams();
  formData.append('user_id', '195425'); 
  formData.append('project_id', '37');
  formData.append('javaclassmethodname', 'getVehicleStatus');
  formData.append('javaclassname', 'com.uffizio.tools.projectmanager.GenerateJSONAjax');
  formData.append('userDateTimeFormat', 'dd-MM-yyyy hh:mm:ss a');
  formData.append('timezone', '-360');
  formData.append('lInActiveTolrance', '0');
  formData.append('Flag', '');
  formData.append('link_id', id);
  formData.append('sImeiNo', imei);
  formData.append('vehicleType', type || 'Bus');

  try {
    const response = await axios.post("https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus", formData.toString(), {
      httpsAgent: agent,
      headers: {
        "Cookie": cookie,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://app.bongoiot.com",
        "Referer": "https://app.bongoiot.com/jsp/quickview.jsp"
      }
    });

    if (typeof response.data === 'string') {
        CACHED_COOKIE = ""; 
        if (BUS_CACHE[cacheKey]) return res.json(BUS_CACHE[cacheKey].data);
    } else {
        BUS_CACHE[cacheKey] = { data: response.data, timestamp: Date.now() };
    }
    res.json(response.data);

  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
       CACHED_COOKIE = ""; 
    }
    if (BUS_CACHE[cacheKey]) return res.json(BUS_CACHE[cacheKey].data);
    res.json({ error: "Fetch Error" });
  }
});

// --- TELEGRAM ALERT ENDPOINT ---
app.get("/send-alert", async (req, res) => {
  const now = Date.now();

  // 1. Anti-Spam Check (1 Hour = 3600000 ms)
  if (now - lastAlertTime < 3600000) {
    console.log("⚠️ Alert skipped: 1-Hour Cooldown active.");
    return res.json({ status: "ignored", reason: "cooldown" });
  }

  // 2. Time Check (Dhaka Time)
  const dhakaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Dhaka"}));
  const h = dhakaTime.getHours();
  const m = dhakaTime.getMinutes();

  // Silence period: 9:00 PM (21:00) to 7:30 AM (07:30)
  const isNight = (h >= 21) || (h < 7) || (h === 7 && m < 30);
  if (isNight) {
    console.log("🌙 Alert skipped: Nighttime silence active.");
    return res.json({ status: "ignored", reason: "night_time" });
  }

  // 3. Send Telegram Message
  try {
    const message = "🚨 BUFT Tracker Alert: 0 active buses detected after 30 seconds! The BongoIOT IDs may have changed, or the system is down.";
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`;
    
    await axios.get(url);
    lastAlertTime = now; // Start the 1-hour cooldown timer
    console.log("🚨 Telegram Alert Sent Successfully!");
    res.json({ status: "success", message: "Alert sent." });
  } catch (error) {
    console.error("❌ Telegram Alert Failed:", error.message);
    res.json({ status: "error", message: "Failed to send alert." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Ready on port ${PORT}`));
