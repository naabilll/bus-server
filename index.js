const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const app = express();

app.use(cors());

// --- GLOBAL VARIABLES ---
const agent = new https.Agent({ rejectUnauthorized: false });
let CACHED_COOKIE = "";
let loginPromise = null;

// --- LOGIN FUNCTION (Prevents Loops) ---
async function getCookie() {
  if (CACHED_COOKIE) return CACHED_COOKIE;

  if (loginPromise) {
    console.log("🚦 Waiting for ongoing login...");
    return await loginPromise;
  }

  console.log("🔑 Starting Login...");
  
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

// --- API ROUTE (WITH AUTO-FIX LOGIC) ---
app.get("/bus-api", async (req, res) => {
  const { id, imei, type } = req.query;

  // 1. Prepare Data Function
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
    // Attempt 1: Try with current cookie
    let cookie = await getCookie();
    if (!cookie) return res.json({ error: "Login failed" });

    let response = await fetchData(cookie);

    // --- SELF HEALING LOGIC ---
    // If response is a String (HTML Login Page) instead of JSON Object
    if (typeof response.data === 'string') {
        console.log("⚠️ Session Expired (Received HTML). Refreshing login...");
        
        CACHED_COOKIE = ""; // 1. Clear dead cookie
        cookie = await getCookie(); // 2. Get fresh cookie
        
        if (cookie) {
            console.log("🔄 Retrying with fresh cookie...");
            response = await fetchData(cookie); // 3. Retry request
        }
    }

    res.json(response.data);

  } catch (error) {
    // Also handle standard error codes
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
       CACHED_COOKIE = ""; 
    }
    console.error("Fetch Error:", error.message);
    res.json({ error: "Fetch Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server Ready on port ${PORT}`);
});
