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

// --- MEMORY CACHE ---
const BUS_CACHE = {}; 

// --- LOGIN FUNCTION ---
async function getCookie() {
  if (CACHED_COOKIE) return CACHED_COOKIE;
  
  // If a login is already happening, wait for it instead of starting a new one
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
        
        // Auto-Clear Session every 20 mins to prevent "4-Hour Bug"
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

app.get("/bus-api", async (req, res) => {
  const { id, imei, type } = req.query;

  // --- 1. CHECK CACHE FIRST ---
  const cacheKey = `${id}`;
  const now = Date.now();
  
  // 🔥 FIX: Set to 5000 (5 Seconds). 
  // This reduces server load by ~50% compared to your old 3s cache.
  if (BUS_CACHE[cacheKey] && (now - BUS_CACHE[cacheKey].timestamp < 5000)) {
      return res.json(BUS_CACHE[cacheKey].data);
  }

  // --- 2. FETCH NEW DATA ---
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
    const response = await axios.post("https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus", formData, {
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
        // If Response is a string, it usually means Session Expired or Error.
        // We CLEAR the cookie so it re-logs in next time.
        // We do NOT cache this error.
        CACHED_COOKIE = ""; 
    } else {
        // If Response is an Object (JSON), it is valid data.
        // We CACHE this for 5 seconds.
        BUS_CACHE[cacheKey] = {
            data: response.data,
            timestamp: Date.now()
        };
    }
    
    res.json(response.data);

  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
       CACHED_COOKIE = ""; 
    }
    res.json({ error: "Fetch Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Ready on port ${PORT}`));
