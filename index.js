const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const app = express();

app.use(cors());

// --- GLOBAL VARIABLES ---
const agent = new https.Agent({ rejectUnauthorized: false });
let CACHED_COOKIE = "";
let LOGIN_TIMESTAMP = 0; // Tracks when we last logged in
let loginPromise = null;

// --- CONFIGURATION ---
// 15 Minutes (15 * 60 seconds * 1000 milliseconds)
const SESSION_LIFETIME = 15 * 60 * 1000; 

// --- LOGIN FUNCTION (With Time Check) ---
async function getCookie(forceRefresh = false) {
  const now = Date.now();

  // 1. If we have a cookie, AND it is fresh (less than 15 mins old), AND we aren't forcing a refresh
  if (CACHED_COOKIE && !forceRefresh && (now - LOGIN_TIMESTAMP < SESSION_LIFETIME)) {
    return CACHED_COOKIE;
  }

  // 2. Prevent multiple users from logging in at the same time
  if (loginPromise) {
    console.log("🚦 Waiting for ongoing login...");
    return await loginPromise;
  }

  console.log(forceRefresh ? "♻️ Cookie Old/Invalid. Refreshing..." : "🔑 Starting Fresh Login (15m Timer Expired)...");
  
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
        LOGIN_TIMESTAMP = Date.now(); // Save the time!
        console.log("✅ Login Success!");
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

// --- API ROUTE ---
app.get("/bus-api", async (req, res) => {
  const { id, imei, type } = req.query;

  // Helper function to send data
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
    // 1. Get Cookie (Only logs in if 15 mins have passed)
    let cookie = await getCookie();
    if (!cookie) return res.json({ error: "Login failed" });

    let response = await fetchData(cookie);

    // 2. Safety Net: If the server STILL rejects us (e.g., they reset the server), Force Login
    if (typeof response.data === 'string') {
        console.log("⚠️ Emergency: Session died early. Force refreshing...");
        cookie = await getCookie(true); // Force New Login
        if (cookie) {
            response = await fetchData(cookie); // Retry
        }
    }

    res.json(response.data);

  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
       // Reset timestamp so next request forces login
       LOGIN_TIMESTAMP = 0; 
    }
    console.error("Fetch Error:", error.message);
    res.json({ error: "Fetch Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server Ready on port ${PORT}`);
});
