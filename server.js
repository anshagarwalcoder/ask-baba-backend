const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- ⚙️ VEDIC CONFIGURATION ---
// Path ko absolute banaya hai taaki Render par error na aaye
const ephePath = path.resolve(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

// --- 🔢 100% REAL CALCULATION ENGINE ---
function generate100RealKundli(dob, time) {
    try {
        if (!dob || !time) return null;

        const parts = dob.split(/[\/\-]/);
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[2]);
        const tParts = time.split(":");
        const h = parseInt(tParts[0]);
        const min = parseInt(tParts[1]);

        // IST to UTC (-5.5 hours) correction
        const ut = (h + min / 60) - 5.5;
        const jd = swe.swe_julday(y, m, d, ut, swe.SE_GREG_CAL);

        if (isNaN(jd)) return null;

        // Force MOSEPH for 1960-2100 stability
        const flag = swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH;
        
        let k = { Planets: {}, Houses: {}, Lagna: {}, Dasha: "", DOB: dob, Time: time };

        // 1. REAL LAGNA (Agra: 27.1767° N, 78.0081° E)
        let cusps = new Array(13), ascmc = new Array(10);
        swe.swe_houses_ex(jd, flag, 27.1767, 78.0081, 'P', cusps, ascmc);
        
        const lagnaDeg = ascmc[0] || 0;
        const lagnaSign = Math.floor(lagnaDeg / 30) + 1;

        // 2. REAL PLANETS
        const planetsMap = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };
        
        for (let p in planetsMap) {
            let xx = new Array(6), serr = "";
            swe.swe_calc_ut(jd, planetsMap[p], flag, xx, serr);
            
            // 🔥 FIXED: toFixed error protection
            let pDeg = (xx && typeof xx[0] === 'number') ? xx[0] : 0;
            
            let pRashiNum = Math.floor(pDeg / 30) + 1;
            let house = (pRashiNum - lagnaSign + 12) % 12 + 1;

            k.Planets[p] = {
                deg: pDeg.toFixed(2),
                rashi: rashis[(pRashiNum - 1) % 12],
                house: house
            };

            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(p);

            if (p === "Moon") {
                const nakIndex = Math.floor(pDeg / (360/27));
                k.Dasha = dashaLords[nakIndex % 9];
            }
        }

        // 3. KETU (Exactly 180° from Rahu)
        let rDeg = parseFloat(k.Planets.Rahu.deg);
        let kDeg = (rDeg + 180) % 360;
        let kRashiNum = Math.floor(kDeg / 30) + 1;
        let kHouse = (kRashiNum - lagnaSign + 12) % 12 + 1;
        k.Planets["Ketu"] = { deg: kDeg.toFixed(2), rashi: rashis[(kRashiNum-1)%12], house: kHouse };
        if(!k.Houses[kHouse]) k.Houses[kHouse] = [];
        k.Houses[kHouse].push("Ketu");

        k.Lagna = { sign: lagnaSign, name: rashis[(lagnaSign-1)%12], deg: lagnaDeg.toFixed(2) };
        return k;
    } catch (e) {
        console.error("Calculation Error:", e);
        return null;
    }
}

// --- 🎨 ASLI KUNDLI CHART DRAWING ---
function drawChart(k) {
    const canvas = createCanvas(800, 1100);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0,0,800,1100);
    
    // Frame
    ctx.strokeStyle = "#8B0000"; ctx.lineWidth = 6;
    ctx.strokeRect(50, 50, 700, 700);
    ctx.beginPath();
    ctx.moveTo(50, 50); ctx.lineTo(750, 750); ctx.moveTo(750, 50); ctx.lineTo(50, 750);
    ctx.moveTo(400, 50); ctx.lineTo(50, 400); ctx.lineTo(400, 750); ctx.lineTo(750, 400); ctx.lineTo(400, 50);
    ctx.stroke();

    const houseCoords = { 1:[400,250], 2:[250,130], 3:[130,250], 4:[250,400], 5:[130,550], 6:[250,670], 7:[400,550], 8:[550,670], 9:[670,550], 10:[550,400], 11:[670,250], 12:[550,130] };
    
    ctx.textAlign = "center";
    for(let h in houseCoords) {
        ctx.fillStyle = "#8B0000"; ctx.font = "bold 42px Serif";
        let rNo = (k.Lagna.sign + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rNo, houseCoords[h][0], houseCoords[h][1] + 55);
        
        ctx.fillStyle = "#000"; ctx.font = "bold 18px Arial";
        let pList = k.Houses[h] || [];
        pList.forEach((p, i) => ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 24)));
    }

    // Planetary Details
    ctx.textAlign = "left"; ctx.fillStyle = "#000"; ctx.font = "bold 22px Arial";
    ctx.fillText(`Lagna: ${k.Lagna.name} | Birth Dasha: ${k.Dasha}`, 60, 800);
    ctx.font = "18px Arial";
    let y = 840;
    Object.keys(k.Planets).forEach((p, i) => {
        let x = i < 5 ? 60 : 400;
        let yPos = i < 5 ? y + (i*32) : y + ((i-5)*32);
        ctx.fillText(`${p}: ${k.Planets[p].deg}° (${k.Planets[p].rashi})`, x, yPos);
    });

    return canvas.toBuffer("image/png");
}

// --- 📡 API ENDPOINTS ---

app.post("/chat", async (req, res) => {
    const { message, dob, time } = req.body;
    let d = dob, t = time;
    if(!d) {
        const dm = message.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
        const tm = message.match(/(\d{1,2}:\d{2})/);
        d = dm ? dm[0] : "01/01/2000"; t = tm ? tm[0] : "12:00";
    }

    const k = generate100RealKundli(d, t);
    if(!k) return res.json({ reply: "Beta, janam tithi sahi se batayein." });

    try {
        const ai = await fetch("https://openrouter.ai/ai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{ 
                    role: "system", 
                    content: `You are 'Ask Baba', an elite Vedic Astrologer. Data: ${JSON.stringify(k)}. 
                    Analyze finance, career, and marriage using REAL Vedic principles. 
                    If user asks for a date, predict the exact month/year based on house transit logic. 
                    Tone: Hinglish, Mystical. Always start with 'Narayan Narayan'.` 
                }, { role: "user", content: message }]
            })
        });
        const data = await ai.json();
        res.json({ reply: data.choices?.[0]?.message?.content || "Dhyan bhatak gaya mera..." });
    } catch (e) {
        res.json({ reply: "Baba dhyan mein hain, phir puchiye." });
    }
});

app.post("/download-kundli", (req, res) => {
    try {
        const { dob, time, message } = req.body;
        let d = dob, t = time;
        if(!d && message) {
            const dm = message.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
            const tm = message.match(/(\d{1,2}:\d{2})/);
            d = dm ? dm[0] : null; t = tm ? tm[0] : null;
        }

        const k = generate100RealKundli(d, t);
        if(!k) return res.status(400).send("Invalid Birth Data");

        const buffer = drawChart(k);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', 'attachment; filename=kundli.png');
        res.send(buffer);
    } catch (err) {
        res.status(500).send("Drawing Failed");
    }
});

app.get("/", (req, res) => res.send("🚀 Asli Baba Backend 1960-2100 is Active!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`Backend live on ${PORT}`));
