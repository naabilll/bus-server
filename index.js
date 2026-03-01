const express = require("express");
const axios = require("axios");
const cors = require("cors");
const https = require("https");
const { URLSearchParams } = require("url");

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

// --- MAIN API ENDPOINT ---
app.get("/bus-api", async (req, res) => {
  const { id, imei, type } = req.query;

  // --- 1. CHECK CACHE FIRST ---
  const cacheKey = `${id}`;
  const now = Date.now();
  
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
        CACHED_COOKIE = ""; // Session died
        // FAIL-SAFE: Return old data if session dies
        if (BUS_CACHE[cacheKey]) return res.json(BUS_CACHE[cacheKey].data);
    } else {
        // SUCCESS: Save to Cache
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
    // FAIL-SAFE: Return old data on network error
    if (BUS_CACHE[cacheKey]) return res.json(BUS_CACHE[cacheKey].data);
    
    res.json({ error: "Fetch Error" });
  }
});

// ==========================================
// 🚑 SECRET AUTO-HEALER ADMIN DASHBOARD
// ==========================================
app.get("/heal", async (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    res.write(`
        <style>body { font-family: monospace; background: #0f172a; color: #38bdf8; padding: 30px; line-height: 1.6; }</style>
        <h2>🚑 BUFT Auto-Healer Server</h2>
        <p>Scanning BongoIOT databases for the new ID block. Please wait...</p><hr>
    `);

    const cookie = await getCookie();
    if (!cookie) return res.end("<p style='color:red;'>❌ Login failed. Cannot scan.</p>");

    // Master List (with your latest manually verified IDs)
    const masterBuses = [
        { name: "Bus 1: Islampur", id: "351072", imei: "863051061903687" }, { name: "Bus 2: Shia Masjid", id: "351073", imei: "863051061866041" },
        { name: "Bus 3: Azampur", id: "351074", imei: "863051061865993" }, { name: "Bus 4: Azampur", id: "351075", imei: "863051061875091" },
        { name: "Bus 5: Pubail", id: "351076", imei: "863051061778279" }, { name: "Bus 6: Girls Hostel", id: "351077", imei: "863051061741285" },
        { name: "Bus 7: Stop", id: "351078", imei: "863051061737937" }, { name: "Bus 8: Azampur", id: "351079", imei: "863051062003073" },
        { name: "Bus 9: Rampura", id: "351080", imei: "863051062002752" }, { name: "Bus 10: Azampur", id: "351081", imei: "863051062003610" },
        { name: "Bus 11: Kalshi", id: "351082", imei: "863051061786785" }, { name: "Bus 12: Tongi", id: "351083", imei: "863051061778220" },
        { name: "Bus 13: Zirani", id: "351084", imei: "863051062002935" }, { name: "Bus 14: Kamlapur", id: "351085", imei: "863051061866694" },
        { name: "Bus 15: Shibbari", id: "351086", imei: "868184062272516" }, { name: "Bus 16: Mirpur-10", id: "351087", imei: "863051061741137" },
        { name: "Bus 17: Commerce", id: "351088", imei: "868184062144723" }, { name: "Bus 18: Pallibiduth", id: "351089", imei: "863051061982632" },
        { name: "Bus 23: Gulistan", id: "351090", imei: "863051062003990" }, { name: "Bus 24: Mirpur-14", id: "351091", imei: "863051061998133" },
        { name: "Bus 25: Newmarket", id: "351092", imei: "863051061775770" }, { name: "Bus 26: Shafipur", id: "351093", imei: "863051061778014" },
        { name: "BRTC 01", id: "351094", imei: "863051061867940" }, { name: "BRTC 02", id: "351095", imei: "863051062002919" },
        { name: "BRTC 03", id: "351096", imei: "863051061786629" }, { name: "BRTC 04", id: "351097", imei: "863051061998075" }
    ];

    async function verifyId(testId, expectedImei) {
        const formData = new URLSearchParams();
        formData.append('user_id', '195425'); formData.append('project_id', '37');
        formData.append('javaclassmethodname', 'getVehicleStatus');
        formData.append('javaclassname', 'com.uffizio.tools.projectmanager.GenerateJSONAjax');
        formData.append('userDateTimeFormat', 'dd-MM-yyyy hh:mm:ss a');
        formData.append('timezone', '-360'); formData.append('lInActiveTolrance', '0');
        formData.append('Flag', ''); formData.append('link_id', testId);
        formData.append('sImeiNo', expectedImei); formData.append('vehicleType', 'Bus');

        try {
            const response = await axios.post("https://app.bongoiot.com/GenerateJSON?method=getVehicleStatus", formData.toString(), {
                httpsAgent: agent, headers: { "Cookie": cookie, "Content-Type": "application/x-www-form-urlencoded" }
            });
            const text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
            return text.includes(expectedImei); // Strict IMEI verification!
        } catch (e) { return false; }
    }

    let offset = 0; let found = false;
    let baseBus = masterBuses[3]; // Uses Bus 4 as the Anchor

    res.write(`<span>[1/2] Hunting for Anchor Bus (${baseBus.name})...</span><br>`);

    // Checks 5000 IDs back and 15000 IDs forward
    for(let i = parseInt(baseBus.id) - 5000; i < parseInt(baseBus.id) + 15000; i++) {
        if(i % 500 === 0) res.write(`<span style="color:#64748b;">Scanning past ${i}...</span><br>`);
        if (await verifyId(i, baseBus.imei)) {
            offset = i - parseInt(baseBus.id); found = true;
            res.write(`<span style="color:#22c55e;">✅ Anchor Found! Database Offset is ${offset > 0 ? '+' : ''}${offset}</span><br><br>`);
            break;
        }
    }

    if (!found) return res.end("<p style='color:red;'>❌ Could not find the new database block.</p>");

    res.write(`<span>[2/2] Calculating and verifying the rest of the fleet...</span><br>`);
    let newArrayCode = "const BUSES = [\n";

    for (let bus of masterBuses) {
        let predictedId = parseInt(bus.id) + offset;
        res.write(`Verifying ${bus.name}... `);

        if (await verifyId(predictedId, bus.imei)) {
            res.write(`<span style="color:#22c55e;">OK</span><br>`);
            newArrayCode += "    { name: \"" + bus.name + "\", id: \"" + predictedId + "\", imei: \"" + bus.imei + "\" },\n";
        } else {
            let localizedFound = false;
            for(let j = predictedId - 3; j <= predictedId + 3; j++) {
                 if (await verifyId(j, bus.imei)) {
                     res.write(`<span style="color:#f59e0b;">Adjusted (+${j - predictedId})</span><br>`);
                     newArrayCode += "    { name: \"" + bus.name + "\", id: \"" + j + "\", imei: \"" + bus.imei + "\" },\n";
                     localizedFound = true; break;
                 }
            }
            if(!localizedFound) {
                res.write(`<span style="color:#ef4444;">OFFLINE (Using old ID)</span><br>`);
                newArrayCode += "    { name: \"" + bus.name + "\", id: \"" + bus.id + "\", imei: \"" + bus.imei + "\" },\n";
            }
        }
    }
    newArrayCode += "];";

    res.write(`<hr><h3>✅ Healing Complete! Copy and paste this into index.html:</h3>`);
    res.write(`<textarea style="width:100%; height:400px; background:#1e293b; color:#a5b4fc; border:none; padding:15px; border-radius:8px;">${newArrayCode}</textarea>`);
    res.end();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server Ready on port ${PORT}`));
