const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const app = express();

app.use(cors());

// --- GLOBAL VARIABLES ---
const agent = new https.Agent({ rejectUnauthorized: false });
let CACHED_COOKIE = "";
let LOGIN_TIMESTAMP = 0; 
let loginPromise = null;

// 15 Minutes Refresh Timer
const SESSION_LIFETIME = 15 * 60 * 1000; 

// --- LOGIN FUNCTION ---
async function getCookie(forceRefresh = false) {
  const now = Date.now();

  // If cookie is fresh (less than 15 mins old), use it.
  if (CACHED_COOKIE && !forceRefresh && (now - LOGIN_TIMESTAMP < SESSION_LIFETIME)) {
    return CACHED_COOKIE;
  }

  // SAFETY FIX: If already logging in, wait, but don't get stuck forever
  if (loginPromise) {
    try {
        return await loginPromise;
    } catch (e) {
        // If the previous login failed, we will try again below
        console.log("⚠️ Previous login attempt failed. Retrying...");
    }
  }

  // Only log this once every 15 minutes
  console.log(forceRefresh ? "♻️ Refreshing Session..." : "🔑 Performing Fresh Login...");
  
  loginPromise = (async () => {
    try {
      const res = await axios.get("https://app.bongoiot.com/jsp/quickview.jsp?param=MzQ0OTMwJkJ1cyZFTg==", {
        httpsAgent: agent,
        timeout: 10000, // SAFETY: Give up after 10 seconds
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
        }
      });

      const rawCookies = res.headers['set-cookie'];
      if (rawCookies) {
        CACHED_COOKIE = rawCookies.map(c => c.split(';')[0]).join('; ');
        LOGIN_TIMESTAMP = Date.now(); 
        console.log("✅ Login Success!");
        return CACHED_COOKIE;
      }
    } catch (e) {
      console.error("❌ Login Failed:", e.message);
      return null;
    } finally {
      loginPromise = null; // SAFETY: Always clear the promise so others can try
    }
  })();

  return await loginPromise;
}

// --- API ROUTE ---
app.get("/bus-api", async (req, res) => {
  const { id, imei, type } = req.query;

  const fetchData = async (cookieToUse) => {
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

    return await axios.post("https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus", formData, {
      httpsAgent: agent,
      timeout: 10000, // SAFETY: Timeout for data fetch too
      headers: {
        "Cookie": cookieToUse,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://app.bongoiot.com",
        "Referer": "https://app.bongoiot.com/jsp/quickview.jsp"
      }
    });
  };

  try {
    let cookie = await getCookie();
    if (!cookie) return res.json({ error: "Login failed" });

    let response = await fetchData(cookie);

    // Auto-Fix Logic
    if (typeof response.data === 'string') {
        console.log("⚠️ Session expired early. Fixing...");
        cookie = await getCookie(true); 
        if (cookie) {
            response = await fetchData(cookie); 
        }
    }

    res.json(response.data);

  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
       LOGIN_TIMESTAMP = 0; 
    }
    // Return empty object on error so map doesn't crash
    res.json({ error: "Fetch Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server Ready on port ${PORT}`);
});
