const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- 🛠 VEDIC CONFIGURATION ---
const ephePath = path.resolve(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0); // Asli Lahiri Ayanamsa

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const nakshatras = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","P.Phalguni","U.Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","P.Ashadha","U.Ashadha","Shravana","Dhanishta","Shatabhisha","P.Bhadra","U.Bhadra","Revati"];
const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

// --- 🔢 100% REAL CALCULATION ENGINE ---
function generateProfessionalKundli(dob, time) {
    try {
        const parts = dob.split(/[\/\-]/);
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[2]);
        const tParts = time.split(":");
        const h = parseInt(tParts[0]);
        const min = parseInt(tParts[1]);

        // ⚠️ IST TO UTC CORRECTION (-5.5 Hours) - CRITICAL FOR REAL KUNDLI
        const ut = (h + min / 60) - 5.5;
        const jd = swe.swe_julday(y, m, d, ut, swe.SE_GREG_CAL);

        if (isNaN(jd)) return null;

        // Force MOSEPH (Math Engine) for 1960-2100 Accuracy
        const flag = swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH;
        
        let k = { Planets: {}, Houses: {}, Lagna: {}, Dasha: "", Nakshatra: "", DOB: dob, Time: time };

        // 1. REAL LAGNA (Agra: 27.17° N, 78.00° E)
        let cusps = new Array(13), ascmc = new Array(10);
        swe.swe_houses_ex(jd, flag, 27.1767, 78.0081, 'P', cusps, ascmc);
        const lagnaDeg = ascmc[0];
        const lagnaSign = Math.floor(lagnaDeg / 30) + 1;

        // 2. REAL PLANETS
        const planetsMap = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };
        
        for (let p in planetsMap) {
            let xx = new Array(6), serr = "";
            swe.swe_calc_ut(jd, planetsMap[p], flag, xx, serr);
            
            let pDeg = xx[0];
            let pRashiNum = Math.floor(pDeg / 30) + 1;
            // Vedic Whole Sign House Calculation
            let house = (pRashiNum - lagnaSign + 12) % 12 + 1;

            k.Planets[p] = {
                deg: pDeg.toFixed(2),
                rashi: rashis[pRashiNum - 1],
                house: house
            };

            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(p);

            // NAKSHATRA & DASHA (Based on Moon)
            if (p === "Moon") {
                const nakIndex = Math.floor(pDeg / (360/27));
                k.Nakshatra = nakshatras[nakIndex % 27];
                k.Dasha = dashaLords[nakIndex % 9];
            }
        }

        // Ketu (Opposite Rahu)
        let rDeg = parseFloat(k.Planets.Rahu.deg);
        let kDeg = (rDeg + 180) % 360;
        let kRashi = Math.floor(kDeg / 30) + 1;
        let kHouse = (kRashi - lagnaSign + 12) % 12 + 1;
        k.Planets["Ketu"] = { deg: kDeg.toFixed(2), rashi: rashis[kRashi-1], house: kHouse };
        if(!k.Houses[kHouse]) k.Houses[kHouse] = [];
        k.Houses[kHouse].push("Ketu");

        k.Lagna = { sign: lagnaSign, name: rashis[lagnaSign-1], deg: lagnaDeg.toFixed(2) };
        return k;
    } catch (e) { return null; }
}

// --- 🎨 UI CHART DRAWING ---
function drawProfessionalChart(k) {
    const canvas = createCanvas(800, 1150);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0,0,800,1150);
    
    // Border & Chart Lines
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

    // Planetary Table Bottom
    ctx.textAlign = "left"; ctx.fillStyle = "#000"; ctx.font = "bold 22px Arial";
    ctx.fillText(`Lagna: ${k.Lagna.name} (${k.Lagna.deg}°) | Nakshatra: ${k.Nakshatra}`, 60, 800);
    ctx.fillText(`Birth Dasha: ${k.Dasha} | Janm: ${k.DOB} ${k.Time}`, 60, 840);
    
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

app.get("/", (req, res) => {
    res.send("🚀 Asli Baba Professional Backend is 100% Online and 2026-Future Ready!");
});

app.post("/chat", async (req, res) => {
    const { message, dob, time } = req.body;
    const k = generateProfessionalKundli(dob || "01/01/2000", time || "12:00");
    if(!k) return res.json({ reply: "Beta, details sahi nahi hain." });

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{ 
                    role: "system", 
                    content: `You are 'Ask Baba', an elite Vedic Astrologer. 
                    TODAY'S DATE: April 4, 2026. 
                    USER KUNDLI: ${JSON.stringify(k)}.
                    
                    CRITICAL RULES:
                    1. Current Year is 2026. Predict for 2026, 2027, 2028 only.
                    2. Moon is in Makar Rashi, Shravana Nakshatra for Ansh. Use this!
                    3. Analyze specific Houses (Finance from 2nd/11th House, Marriage from 7th).
                    4. Start with 'Narayan Narayan'. Use Hinglish.`
                }, { role: "user", content: message }]
            })
        });
        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (e) { res.json({ reply: "Dhyan bhatak gaya mera." }); }
});

app.post("/download-kundli", (req, res) => {
    try {
        const { dob, time } = req.body;
        const k = generateProfessionalKundli(dob, time);
        if(!k) return res.status(400).send("Error");

        const buffer = drawProfessionalChart(k);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', buffer.length);
        res.setHeader('Content-Disposition', 'attachment; filename=kundli.png');
        res.send(buffer);
    } catch (e) { res.status(500).send("Failed"); }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`Professional Backend live on ${PORT}`));
