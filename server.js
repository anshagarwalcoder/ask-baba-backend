const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- 🛠 VEDIC ENGINE SETUP ---
const ephePath = path.resolve(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
// Real Lahiri Ayanamsa (Standard for Indian Astrology)
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const nakshatras = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","P.Phalguni","U.Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","P.Ashadha","U.Ashadha","Shravana","Dhanishta","Shatabhisha","P.Bhadra","U.Bhadra","Revati"];
const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

// --- 🔢 REAL CALCULATION ENGINE ---
function generateAsliKundli(dob, time) {
    try {
        if (!dob || !time) return null;

        const parts = dob.split(/[\/\-]/);
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[2]);
        const tParts = time.split(":");
        const h = parseInt(tParts[0]);
        const min = parseInt(tParts[1]);

        // ⚠️ Sabse Important: IST to UTC Conversion (-5.5 hours)
        // India is 5:30 hours ahead of GMT. This fix brings 100% accuracy.
        const ut = (h + min / 60) - 5.5;
        const jd = swe.swe_julday(y, m, d, ut, swe.SE_GREG_CAL);

        if (isNaN(jd) || jd < 0) return null;

        // Force MOSEPH engine (Math based) to avoid 0.00 degree errors
        const flag = swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH;
        
        let k = { Planets: {}, Houses: {}, Lagna: {}, Dasha: "", Nakshatra: "", DOB: dob, Time: time };

        // 1. REAL LAGNA (Agra Coordinates: 27.17, 78.00)
        let cusps = new Array(13), ascmc = new Array(10);
        swe.swe_houses_ex(jd, flag, 27.1767, 78.0081, 'P', cusps, ascmc);
        
        const lagnaDeg = ascmc[0] || 0;
        const lagnaSign = Math.floor(lagnaDeg / 30) + 1;

        // 2. REAL PLANETS
        const planetsMap = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };
        
        for (let p in planetsMap) {
            let xx = new Array(6), serr = "";
            swe.swe_calc_ut(jd, planetsMap[p], flag, xx, serr);
            
            let pDeg = (xx && typeof xx[0] === 'number') ? xx[0] : 0;
            let pRashiNum = Math.floor(pDeg / 30) + 1;
            
            // Vedic Whole Sign House Calculation
            let house = (pRashiNum - lagnaSign + 12) % 12 + 1;

            k.Planets[p] = {
                deg: pDeg.toFixed(2),
                rashi: rashis[(pRashiNum - 1) % 12],
                house: house
            };

            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(p);

            // Vimshottari Dasha & Nakshatra based on Moon
            if (p === "Moon") {
                const nakRange = 360 / 27;
                const nakIdx = Math.floor(pDeg / nakRange);
                k.Nakshatra = nakshatras[nakIdx % 27];
                k.Dasha = dashaLords[nakIdx % 9];
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
        return null;
    }
}

// --- 🎨 PROFESSIONAL CHART DRAWING ---
function drawChart(k) {
    const canvas = createCanvas(800, 1150);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0,0,800,1150);
    
    // North Indian Style Kundli
    ctx.strokeStyle = "#8B0000"; ctx.lineWidth = 6;
    ctx.strokeRect(50, 50, 700, 700);
    ctx.beginPath();
    ctx.moveTo(50, 50); ctx.lineTo(750, 750); ctx.moveTo(750, 50); ctx.lineTo(50, 750);
    ctx.moveTo(400, 50); ctx.lineTo(50, 400); ctx.lineTo(400, 750); ctx.lineTo(750, 400); ctx.lineTo(400, 50);
    ctx.stroke();

    const houseCoords = { 1:[400,250], 2:[250,130], 3:[130,250], 4:[250,400], 5:[130,550], 6:[250,670], 7:[400,550], 8:[550,670], 9:[670,550], 10:[550,400], 11:[670,250], 12:[550,130] };
    
    ctx.textAlign = "center";
    for(let h in houseCoords) {
        // Draw House Rashi Numbers
        ctx.fillStyle = "#8B0000"; ctx.font = "bold 42px Serif";
        let rNo = (k.Lagna.sign + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rNo, houseCoords[h][0], houseCoords[h][1] + 55);
        
        // Draw Planet Names
        ctx.fillStyle = "#000"; ctx.font = "bold 18px Arial";
        let pList = k.Houses[h] || [];
        pList.forEach((p, i) => ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 24)));
    }

    // Planetary Info Table (Bottom)
    ctx.textAlign = "left"; ctx.fillStyle = "#000"; ctx.font = "bold 22px Arial";
    ctx.fillText(`Lagna: ${k.Lagna.name} (${k.Lagna.deg}°)`, 60, 800);
    ctx.fillText(`Nakshatra: ${k.Nakshatra} | Janm Dasha: ${k.Dasha}`, 60, 840);
    
    ctx.font = "18px Arial";
    let y = 880;
    Object.keys(k.Planets).forEach((p, i) => {
        let x = i < 5 ? 60 : 400;
        let yPos = i < 5 ? y + (i*35) : y + ((i-5)*35);
        ctx.fillText(`${p}: ${k.Planets[p].deg}° (${k.Planets[p].rashi})`, x, yPos);
    });

    return canvas.toBuffer("image/png");
}

// --- 📡 API ENDPOINTS ---

app.post("/chat", async (req, res) => {
    try {
        const { message, dob, time } = req.body;
        // Smart parse date if not provided
        let d = dob, t = time;
        if(!d) {
            const dm = message.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
            const tm = message.match(/(\d{1,2}:\d{2})/);
            d = dm ? dm[0] : "01/01/2000"; t = tm ? tm[0] : "12:00";
        }

        const k = generateAsliKundli(d, t);
        if(!k) return res.json({ reply: "Beta, tithi sahi se batayein." });

        const ai = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{ 
                    role: "system", 
                    content: `You are 'Ask Baba', an elite Vedic Astrologer. Analyze this Real Kundli: ${JSON.stringify(k)}. 
                    - Start with 'Narayan Narayan'. 
                    - Analyze specific houses for career and money.
                    - Give exact Month/Year for marriage or success based on dasha.
                    - Tone: Wise Pandit, Hinglish.` 
                }, { role: "user", content: message }]
            })
        });
        const data = await ai.json();
        res.json({ reply: data.choices?.[0]?.message?.content || "Baba meditation mein hain." });
    } catch (e) {
        res.json({ reply: "Beta, dhyan bhatak gaya mera. Phir pucho." });
    }
});

app.post("/download-kundli", (req, res) => {
    try {
        const { dob, time } = req.body;
        const k = generateAsliKundli(dob, time);
        if(!k) return res.status(400).send("Data missing");

        const buf = drawChart(k);
        // explicit headers to prevent download failed
        res.set({
            "Content-Type": "image/png",
            "Content-Length": buf.length,
            "Content-Disposition": "attachment; filename=kundli.png"
        });
        res.send(buf);
    } catch (err) {
        res.status(500).send("Error");
    }
});

app.get("/", (req, res) => res.send("🚀 Real Baba Backend is Live!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`Backend live on ${PORT}`));
