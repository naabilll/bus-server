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

// --- HELPER: PAUSE FUNCTION ---
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- LOGIN FUNCTION ---
async function getCookie() {
  if (CACHED_COOKIE) return CACHED_COOKIE;
  if (loginPromise) return await loginPromise;

  loginPromise = (async () => {
    try {
      console.log("🔑 Authenticating with BongoIoT...");
      const res = await axios.get("https://app.bongoiot.com/jsp/quickview.jsp?param=MzQ0OTMwJkJ1cyZFTg==", {
        httpsAgent: agent,
        headers: { 
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" 
        }
      });

      const rawCookies = res.headers['set-cookie'];
      if (rawCookies) {
        CACHED_COOKIE = rawCookies.map(c => c.split(';')[0]).join('; ');
        console.log("✅ Login Success! (Waiting 500ms for session to sync...)");
        
        // CRITICAL FIX: Wait 500ms for the session to register on their end
        await sleep(500);

        // Auto-Clear Session every 20 mins
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

  // --- 1. CHECK CACHE (5 Seconds) ---
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

    // CHECK RESPONSE
    if (typeof response.data === 'string') {
        // Only clear cookie if it's a short error string (likely HTML error)
        if(response.data.length < 500) {
            console.log("⚠️ Session Error. Clearing Cookie.");
            CACHED_COOKIE = ""; 
        }
        
        // FAIL-SAFE: If we have old data, return it instead of "0 Buses"
        if (BUS_CACHE[cacheKey]) {
            return res.json(BUS_CACHE[cacheKey].data);
        }
    } else {
        // SUCCESS
        BUS_CACHE[cacheKey] = { data: response.data, timestamp: Date.now() };
    }
    
    res.json(response.data);

  } catch (error) {
    if (error.response && (error.response.status === 401 || error.response.status === 403)) {
       CACHED_COOKIE = ""; 
    }
    // Network error? Return old data
    if (BUS_CACHE[cacheKey]) {
        return res.json(BUS_CACHE[cacheKey].data);
    }
    res.json({ error: "Fetch Error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Ready on port ${PORT}`));
