const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const { URLSearchParams } = require("url");

const app = express();
app.use(cors());

// --- SECURE TELEGRAM CONFIG ---
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
let lastAlertTime = 0; 

// --- MASTER BUS DATABASE (UPDATED) ---
const BUSES = [
    { name: "Bus 01: Islampur", id: "356297", imei: "863051061903687" },
    { name: "Bus 02: Shia Masjid", id: "356300", imei: "863051061866041" },
    { name: "Bus 03: Azampur", id: "356302", imei: "863051061865993" },
    { name: "Bus 04: Azampur", id: "356305", imei: "863051061875091" },
    { name: "Bus 05: Pubail", id: "356307", imei: "863051061778279" },
    { name: "Bus 06: Girls Hostel", id: "356308", imei: "863051061741285" },
    { name: "Bus 07: Rampura", id: "356309", imei: "863051061737937" },
    { name: "Bus 08: Azampur", id: "356310", imei: "863051062003073" },
    { name: "Bus 09: Azampur", id: "356311", imei: "863051062002752" },
    { name: "Bus 10: Stop", id: "356312", imei: "863051062003610" },
    { name: "Bus 11: Newmarket", id: "356313", imei: "863051061786785" },
    { name: "Bus 12: Kalshi", id: "356314", imei: "863051061778220" },
    { name: "Bus 13: Polli Bidut", id: "356315", imei: "863051062002935" },
    { name: "Bus 14: Tongi", id: "356316", imei: "863051061866694" },
    { name: "Bus 15: Shibbari", id: "356317", imei: "868184062272516" },
    { name: "Bus 16: Kamlapur", id: "356318", imei: "863051061741137" },
    { name: "Bus 17: Mirpur-10", id: "356319", imei: "868184062144723" },
    { name: "Bus 18: Baipail", id: "356320", imei: "863051061982632" },
    { name: "Bus 23: Commerce", id: "356322", imei: "863051062003990" },
    { name: "Bus 24: Gulistan", id: "356323", imei: "863051061998133" },
    { name: "Bus 25: Mirpur-14", id: "356327", imei: "863051061775770" },
    { name: "Bus 26: Shafipur", id: "356328", imei: "863051061778014" },
    { name: "BRTC 01", id: "356329", imei: "863051061867940" },
    { name: "BRTC 02", id: "356330", imei: "863051062002919" },
    { name: "BRTC 03", id: "356331", imei: "863051061786629" },
    { name: "BRTC 04", id: "356332", imei: "863051061998075" }
];

const agent = new https.Agent({ rejectUnauthorized: false });
let CACHED_COOKIE = "";
let loginPromise = null;
let masterFleetCache = { data: [], timestamp: 0 };
let isFetching = false;

async function getCookie() {
  if (CACHED_COOKIE) return CACHED_COOKIE;
  if (loginPromise) return await loginPromise;
  loginPromise = (async () => {
    try {
      const res = await axios.get("https://app.bongoiot.com/jsp/quickview.jsp?param=MzQ0OTMwJkJ1cyZFTg==", { httpsAgent: agent });
      const rawCookies = res.headers['set-cookie'];
      if (rawCookies) {
        CACHED_COOKIE = rawCookies.map(c => c.split(';')[0]).join('; ');
        setTimeout(() => { CACHED_COOKIE = ""; }, 20 * 60 * 1000); 
        console.log("✅ BongoIoT Login Successful!");
        return CACHED_COOKIE;
      }
    } catch (e) { return null; } finally { loginPromise = null; }
  })();
  return await loginPromise;
}

// --- NEW: BACKGROUND WARM-UP ENGINE ---
// This continuously fetches data in the background so it's always ready instantly.
async function refreshFleetData() {
    if (isFetching) return; 
    isFetching = true;

    const cookie = await getCookie();
    if (!cookie) {
        isFetching = false;
        return;
    }

    try {
        const fetchPromises = BUSES.map(async (bus) => {
            const formData = new URLSearchParams();
            formData.append('user_id', '195425'); formData.append('project_id', '37');
            formData.append('javaclassmethodname', 'getVehicleStatus'); formData.append('javaclassname', 'com.uffizio.tools.projectmanager.GenerateJSONAjax');
            formData.append('userDateTimeFormat', 'dd-MM-yyyy hh:mm:ss a'); formData.append('timezone', '-360');
            formData.append('lInActiveTolrance', '0'); formData.append('link_id', bus.id);
            formData.append('sImeiNo', bus.imei); formData.append('vehicleType', 'Bus');

            const response = await axios.post("https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus", formData.toString(), {
                httpsAgent: agent, headers: { "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded" }
            });

            if (typeof response.data === 'string') {
                let data;
                try { data = new Function("return " + response.data)(); } catch(e) { return null; }
                
                if (data && data.root && data.root[0] && data.root[0][0]) {
                    const info = data.root[0][0];
                    let dName = "--", dPhone = "--";
                    if (info.driver_json) {
                        try {
                            const dObj = typeof info.driver_json === 'string' ? JSON.parse(info.driver_json.replace(/'/g, '"')) : info.driver_json;
                            dName = dObj.name || "--"; dPhone = dObj.mobile_no || "--";
                        } catch(e){}
                    }
                    return {
                        id: bus.id, name: bus.name, 
                        lat: parseFloat(info.latitude) || 0, lng: parseFloat(info.longitude) || 0,
                        speed: parseFloat(info.speed) || 0, status: info.sts || "Unknown",
                        since: info.since || "--", updated: info.data_inserted_time,
                        driver: dName, phone: dPhone, course: parseInt(info.angle) || 0,
                        address: info.location || "Moving..."
                    };
                }
            }
            return null;
        });

        const results = await Promise.all(fetchPromises);
        const cleanData = results.filter(b => b !== null);
        
        // Update the master memory cache
        if (cleanData.length > 0) {
            masterFleetCache = { data: cleanData, timestamp: Date.now() };
        }

    } catch (error) {
        console.error("Background Fetch Error:", error.message);
    } finally {
        isFetching = false;
    }
}

// Run the engine continuously every 5 seconds (5000ms)
setInterval(refreshFleetData, 5000);

// --- HIGH PERFORMANCE BATCH ENDPOINT ---
app.get("/fleet", async (req, res) => {
    // If it's a cold start and memory is empty, force one fetch immediately
    if (masterFleetCache.data.length === 0) {
        await refreshFleetData();
    }
    
    // Instantly return the pre-fetched data from memory
    res.json(masterFleetCache.data);
});

// --- TELEGRAM ALERT ENDPOINT ---
app.get("/send-alert", async (req, res) => {
  const now = Date.now();
  if (now - lastAlertTime < 3600000) return res.json({ status: "ignored", reason: "cooldown" });

  const dhakaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Dhaka"}));
  const h = dhakaTime.getHours(); const m = dhakaTime.getMinutes();
  const isNight = (h > 21) || (h === 21 && m >= 30) || (h < 6) || (h === 6 && m < 30);
  
  if (isNight) return res.json({ status: "ignored", reason: "night_time" });

  if (!TELEGRAM_BOT_TOKEN) return res.json({status: "error", reason: "No token set"});

  try {
    // Updated text to match the 15-second timer
    const message = "🚨 BUFT Tracker Alert: 0 active buses detected after 15 seconds! The BongoIOT IDs may have changed.";
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`;
    await axios.get(url);
    lastAlertTime = now; 
    res.json({ status: "success" });
  } catch (error) { res.json({ status: "error" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Master Backend Ready on port ${PORT}`);
    refreshFleetData(); // Trigger the first fetch immediately on boot
});
