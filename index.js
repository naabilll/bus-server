const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const app = express();

app.use(cors());

// --- GLOBAL CONFIGURATION ---
const agent = new https.Agent({ rejectUnauthorized: false });
let CACHED_COOKIE = "";
let loginPromise = null;

// --- MEMORY CACHE ---
const BUS_CACHE = {}; 

// --- CONFIG: CACHE DURATION ---
// FLAT 5 Seconds for everything. 
// No 20s delay. Fast updates for everyone.
const CACHE_DURATION = 5000; 

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

  // --- CHECK CACHE (Simple & Fast) ---
  // If we have data younger than 5 seconds, return it immediately.
  if (BUS_CACHE[cacheKey] && (now - BUS_CACHE[cacheKey].timestamp < CACHE_DURATION)) {
      return res.json(BUS_CACHE[cacheKey].data);
  }

  // --- FETCH NEW DATA ---
  const cookie = await getCookie();
  if (!cookie) return res.json({ error: "Login failed" });

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

    if (typeof response.data === 'string') {
        CACHED_COOKIE = ""; 
        // If session died, try to return old data to keep UI alive
        if (BUS_CACHE[cacheKey]) return res.json(BUS_CACHE[cacheKey].data);
    } else {
        // Save new data
        BUS_CACHE[cacheKey] = { data: response.data, timestamp: Date.now() };
    }
    res.json(response.data);

  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
       CACHED_COOKIE = ""; 
    }
    // Fail-safe: Return old data if fetch fails
    if (BUS_CACHE[cacheKey]) return res.json(BUS_CACHE[cacheKey].data);
    res.json({ error: "Fetch Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Proxy Server Ready on port ${PORT}`));
