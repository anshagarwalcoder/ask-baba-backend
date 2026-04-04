const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Ephemeris Config
const ephePath = path.join(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0); // Asli Lahiri Ayanamsa

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const nakshatras = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","P.Phalguni","U.Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","P.Ashadha","U.Ashadha","Shravana","Dhanishta","Shatabhisha","P.Bhadra","U.Bhadra","Revati"];
const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

// --- 🔢 ADVANCED ASTRO LOGIC ---

function getVimshottariDasha(moonDeg) {
    const totalCycle = 120;
    const oneNakDeg = 360 / 27; // 13.333
    const nakIndex = Math.floor(moonDeg / oneNakDeg);
    const startLord = dashaLords[nakIndex % 9];
    return startLord;
}

function generateKundli(dob, time, place) {
    try {
        // IST to UTC Conversion (-5:30)
        const dParts = dob.includes("-") ? dob.split("-").reverse() : dob.split("/");
        const [d, m, y] = dParts.map(Number);
        const [h, min] = (time || "12:00").split(":").map(Number);
        const utTime = (h + min / 60) - 5.5; 
        const jd = swe.swe_julday(y, m, d, utTime, swe.SE_GREG_CAL);

        // Location Fix (Agra default but use dynamic lat/lon for 100% real)
        const lat = 27.1767, lon = 78.0081;

        let cusps = new Array(13), ascmc = new Array(10);
        swe.swe_houses_ex(jd, swe.SEFLG_SIDEREAL, lat, lon, 'P', cusps, ascmc);
        
        const lagnaDeg = ascmc[0];
        const lagnaRashiNum = Math.floor(lagnaDeg / 30) + 1;

        let k = { Planets: {}, Houses: {}, Lagna: {}, Mahadasha: "", Nakshatra: "" };

        const planetsMap = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };

        for (let p in planetsMap) {
            let xx = new Array(6), serr = "";
            // USE MOSEPH for dates outside your ephe file range (2006 etc)
            let flag = swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH;
            swe.swe_calc_ut(jd, planetsMap[p], flag, xx, serr);
            
            let pDeg = xx[0];
            const pRashiNum = Math.floor(pDeg / 30) + 1;
            let house = (pRashiNum - lagnaRashiNum + 12) % 12 + 1;

            k.Planets[p] = { 
                degree: pDeg.toFixed(2), 
                rashi: rashis[pRashiNum-1], 
                house,
                nakshatra: nakshatras[Math.floor(pDeg / (360/27))]
            };
            
            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(p);

            if (p === "Moon") {
                k.Nakshatra = k.Planets[p].nakshatra;
                k.Mahadasha = getVimshottariDasha(pDeg);
            }
        }

        // Ketu
        let kDeg = (parseFloat(k.Planets.Rahu.degree) + 180) % 360;
        let kHouse = (Math.floor(kDeg / 30) + 1 - lagnaRashiNum + 12) % 12 + 1;
        k.Planets["Ketu"] = { degree: kDeg.toFixed(2), rashi: rashis[Math.floor(kDeg/30)], house: kHouse };
        if(!k.Houses[kHouse]) k.Houses[kHouse] = [];
        k.Houses[kHouse].push("Ketu");

        k.Lagna = { signNum: lagnaRashiNum, rashi: rashis[lagnaRashiNum-1], degree: lagnaDeg.toFixed(2) };
        return k;
    } catch (e) { return null; }
}

// --- 🎨 PRO CHART DRAWING ---
function drawProfessionalChart(k) {
    const canvas = createCanvas(1000, 1200); // Bada canvas for extra info
    const ctx = canvas.getContext("2d");
    
    // Background & Chart
    ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0,0,1000,1200);
    ctx.strokeStyle = "#8B0000"; ctx.lineWidth = 6;
    ctx.strokeRect(100,100,800,800);
    
    ctx.beginPath();
    ctx.moveTo(100,100); ctx.lineTo(900,900); ctx.moveTo(900,100); ctx.lineTo(100,900);
    ctx.moveTo(500,100); ctx.lineTo(100,500); ctx.lineTo(500,900); ctx.lineTo(900,500); ctx.lineTo(500,100);
    ctx.stroke();

    const houseCoords = { 1:[500,320], 2:[350,200], 3:[200,320], 4:[350,500], 5:[200,680], 6:[350,800], 7:[500,680], 8:[650,800], 9:[800,680], 10:[650,500], 11:[800,320], 12:[650,200] };
    
    ctx.textAlign = "center";
    for(let h in houseCoords) {
        ctx.fillStyle = "#8B0000"; ctx.font = "bold 45px Serif";
        let rNo = (k.Lagna.signNum + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rNo, houseCoords[h][0], houseCoords[h][1] + 60);
        
        ctx.fillStyle = "#000"; ctx.font = "bold 24px Arial";
        (k.Houses[h] || []).forEach((p, i) => ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 30)));
    }

    // --- INFO TABLE (ASLI LOOK) ---
    ctx.fillStyle = "#000"; ctx.font = "bold 28px Arial";
    ctx.textAlign = "left";
    ctx.fillText(`Lagna: ${k.Lagna.rashi} (${k.Lagna.degree}°)`, 100, 960);
    ctx.fillText(`Nakshatra: ${k.Nakshatra}`, 100, 1000);
    ctx.fillText(`Janm Mahadasha: ${k.Mahadasha}`, 100, 1040);
    
    ctx.font = "20px Arial";
    let y = 1080;
    Object.keys(k.Planets).slice(0,5).forEach(p => {
        ctx.fillText(`${p}: ${k.Planets[p].rashi} (${k.Planets[p].degree}°)`, 100, y);
        y += 30;
    });

    return canvas.toBuffer("image/png");
}

// --- 📡 API ENDPOINTS ---

app.post("/chat", async (req, res) => {
    const { message, dob, time, place } = req.body;
    const k = generateKundli(dob, time, place);
    if(!k) return res.json({ reply: "Beta, janam ki sahi jankari do." });

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [
                    { role: "system", content: `You are 'Ask Baba', a world-class Pandit. 
                    Analyze this Precise Kundli: ${JSON.stringify(k)}.
                    - Start with 'Narayan Narayan'.
                    - Explain the effect of ${k.Mahadasha} dasha and ${k.Nakshatra} nakshatra.
                    - Analyze House placements for Career and Money.
                    - Give a specific Vedic Remedy (Upay).` },
                    { role: "user", content: message }
                ]
            })
        });
        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (e) { res.json({ reply: "Dhyan mein vighna hai, beta." }); }
});

app.post("/download-kundli", (req, res) => {
    const k = generateKundli(req.body.dob, req.body.time, req.body.place);
    if(!k) return res.status(400).send("Error");
    res.set("Content-Type", "image/png");
    res.send(drawProfessionalChart(k));
});

app.get("/", (req, res) => res.send("🚀 Professional Vedic Backend Active"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log("Professional Server Running"));