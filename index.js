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

app.get("/bus-api", async (req, res) => {
  const { id, imei, type } = req.query;
  const cacheKey = `${id}`;
  const now = Date.now();

  // --- 1. CHECK CACHE (5 Seconds for speed) ---
  if (BUS_CACHE[cacheKey] && (now - BUS_CACHE[cacheKey].timestamp < 5000)) {
      return res.json(BUS_CACHE[cacheKey].data);
  }

  // --- 2. FETCH NEW DATA ---
  const cookie = await getCookie();
  
  // FAIL-SAFE 1: If login fails, try to return old cache (up to 60s old)
  if (!cookie) {
      if (BUS_CACHE[cacheKey] && (now - BUS_CACHE[cacheKey].timestamp < 60000)) {
          return res.json(BUS_CACHE[cacheKey].data);
      }
      return res.json({}); // Return empty JSON to prevent frontend crash
  }

  const formData = new URLSearchParams();
  formData.append('user_id', '195425'); 
  formData.append('project_id', '37');
  formData.append('javaclassmethodname', 'getVehicleStatus');
  formData.append('javaclassname', 'com.uffizio.tools.projectmanager.GenerateJSONAjax');
  formData.append('link_id', id);
  formData.append('sImeiNo', imei);
  formData.append('vehicleType', type || 'Bus');

  try {
    const response = await axios.post("https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus", formData, {
      httpsAgent: agent,
      headers: { "Cookie": cookie }
    });

    // --- 3. VALIDATE RESPONSE ---
    if (typeof response.data === 'string') {
        // Session likely died or server error
        CACHED_COOKIE = ""; 
        
        // FAIL-SAFE 2: Return old cache if valid (up to 60s old)
        if (BUS_CACHE[cacheKey] && (now - BUS_CACHE[cacheKey].timestamp < 60000)) {
            return res.json(BUS_CACHE[cacheKey].data);
        }
        // If no cache, return empty object (prevents frontend crash)
        return res.json({});
    } else {
        // SUCCESS: Save to cache
        BUS_CACHE[cacheKey] = { data: response.data, timestamp: Date.now() };
        res.json(response.data);
    }

  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
       CACHED_COOKIE = ""; 
    }
    // FAIL-SAFE 3: Network error? Return old cache (up to 60s old)
    if (BUS_CACHE[cacheKey] && (now - BUS_CACHE[cacheKey].timestamp < 60000)) {
        return res.json(BUS_CACHE[cacheKey].data);
    }
    res.json({}); // Clean exit
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Proxy Server Ready on port ${PORT}`));
