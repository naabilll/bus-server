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

// --- MASTER BUS DATABASE (HIDDEN FROM PUBLIC) ---
const BUSES = [
    { name: "Bus 1: Islampur", id: "351072", imei: "863051061903687" },
    { name: "Bus 2: Shia Masjid", id: "351073", imei: "863051061866041" },
    { name: "Bus 3: Azampur", id: "351074", imei: "863051061865993" },
    { name: "Bus 4: Azampur", id: "351075", imei: "863051061875091" },
    { name: "Bus 5: Pubail", id: "351076", imei: "863051061778279" },
    { name: "Bus 6: Girls Hostel", id: "351077", imei: "863051061741285" },
    { name: "Bus 7: Stop", id: "351079", imei: "863051061737937" },
    { name: "Bus 8: Azampur", id: "351080", imei: "863051062003073" },
    { name: "Bus 9: Rampura", id: "351081", imei: "863051062002752" },
    { name: "Bus 10: Azampur", id: "351082", imei: "863051062003610" },
    { name: "Bus 11: Kalshi", id: "351083", imei: "863051061786785" },
    { name: "Bus 12: Tongi", id: "351084", imei: "863051061778220" },
    { name: "Bus 13: Zirani", id: "351085", imei: "863051062002935" },
    { name: "Bus 14: Kamlapur", id: "351086", imei: "863051061866694" },
    { name: "Bus 15: Shibbari", id: "351087", imei: "868184062272516" },
    { name: "Bus 16: Mirpur-10", id: "351088", imei: "863051061741137" },
    { name: "Bus 17: Commerce", id: "351089", imei: "868184062144723" },
    { name: "Bus 18: Pallibiduth", id: "351090", imei: "863051061982632" },
    { name: "Bus 23: Gulistan", id: "351091", imei: "863051062003990" },
    { name: "Bus 24: Mirpur-14", id: "351092", imei: "863051061998133" },
    { name: "Bus 25: Newmarket", id: "351650", imei: "863051061775770" },
    { name: "Bus 26: Shafipur", id: "351093", imei: "863051061778014" },
    { name: "BRTC 01", id: "351094", imei: "863051061867940" },
    { name: "BRTC 02", id: "351095", imei: "863051062002919" },
    { name: "BRTC 03", id: "351096", imei: "863051061786629" },
    { name: "BRTC 04", id: "351097", imei: "863051061998075" }
];

const agent = new https.Agent({ rejectUnauthorized: false });
let CACHED_COOKIE = "";
let loginPromise = null;
let masterFleetCache = { data: [], timestamp: 0 };

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
        return CACHED_COOKIE;
      }
    } catch (e) { return null; } finally { loginPromise = null; }
  })();
  return await loginPromise;
}

// --- HIGH PERFORMANCE BATCH ENDPOINT ---
app.get("/fleet", async (req, res) => {
    const now = Date.now();
    // Use 4-second cache to prevent server overload
    if (masterFleetCache.data.length > 0 && (now - masterFleetCache.timestamp < 4000)) {
        return res.json(masterFleetCache.data);
    }

    const cookie = await getCookie();
    if (!cookie) return res.status(500).json({ error: "Login failed" });

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
        
        masterFleetCache = { data: cleanData, timestamp: Date.now() };
        res.json(cleanData);

    } catch (error) {
        res.status(500).json({ error: "Batch fetch failed" });
    }
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
    const message = "🚨 BUFT Tracker Alert: 0 active buses detected after 10 seconds! The BongoIOT IDs may have changed.";
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage?chat_id=${TELEGRAM_CHAT_ID}&text=${encodeURIComponent(message)}`;
    await axios.get(url);
    lastAlertTime = now; 
    res.json({ status: "success" });
  } catch (error) { res.json({ status: "error" }); }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Master Backend Ready on port ${PORT}`));
