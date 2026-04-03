const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- 🚀 ROOT ROUTE (Taaki 'Cannot GET' na aaye) ---
app.get("/", (req, res) => {
    res.send("🚀 Ask Baba Professional Backend is Running and calculation is active!");
});

// --- REAL VEDIC CONFIGURATION ---
const ephePath = path.join(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0); 

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

const locationMap = {
  "Agra": { lat: 27.1767, lon: 78.0081 },
  "Delhi": { lat: 28.6139, lon: 77.2090 },
  "Mumbai": { lat: 19.0760, lon: 72.8777 }
};

// 1. Precise Julian Day with IST Correction
function getJulianDay(dob, time) {
    try {
        const dParts = dob.includes("-") ? dob.split("-").reverse() : dob.split("/");
        const [d, m, y] = dParts.map(Number);
        const [h, min] = (time || "12:00").split(":").map(Number);
        // IST (India) is UTC + 5:30. Subtracting it to get UT.
        const utTime = (h + min / 60) - 5.5; 
        return swe.swe_julday(y, m, d, utTime, swe.SE_GREG_CAL);
    } catch(e) { return 2451545.0; }
}

// 2. THE REAL VEDIC ENGINE
function generateKundli(dob, time, place) {
    try {
        const loc = locationMap[place] || locationMap["Delhi"];
        const jd = getJulianDay(dob, time);
        
        let k = { Planets: {}, Houses: {}, Lagna: {} };

        // Real Lagna
        let cusps = new Array(13), ascmc = new Array(10);
        swe.swe_houses_ex(jd, swe.SEFLG_SIDEREAL, loc.lat, loc.lon, 'P', cusps, ascmc);
        const lagnaDeg = ascmc[0];
        const lagnaRashiNum = Math.floor(lagnaDeg / 30) + 1;

        const planetsMap = { 
            Sun: swe.SE_SUN, Moon: swe.SE_MOON, Mars: swe.SE_MARS, 
            Mercury: swe.SE_MERCURY, Jupiter: swe.SE_JUPITER, 
            Venus: swe.SE_VENUS, Saturn: swe.SE_SATURN, Rahu: swe.SE_MEAN_NODE 
        };

        for (let pName in planetsMap) {
            let xx = new Array(6), serr = "";
            // Using MOSEPH fallback for stability if files are missing
            let flag = swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH;
            swe.swe_calc_ut(jd, planetsMap[pName], flag, xx, serr);
            
            let pDeg = xx[0];
            const pRashiNum = Math.floor(pDeg / 30) + 1;
            let house = (pRashiNum - lagnaRashiNum + 12) % 12 + 1;

            k.Planets[pName] = { 
                degree: pDeg.toFixed(2), 
                rashi: rashis[pRashiNum - 1], 
                house: house 
            };
            
            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(pName);
        }

        // Ketu (Exactly 180 degrees from Rahu)
        let rahuDeg = parseFloat(k.Planets.Rahu.degree);
        let ketuDeg = (rahuDeg + 180) % 360;
        let kRashi = Math.floor(ketuDeg / 30) + 1;
        let kHouse = (kRashi - lagnaRashiNum + 12) % 12 + 1;
        k.Planets["Ketu"] = { degree: ketuDeg.toFixed(2), rashi: rashis[kRashi-1], house: kHouse };
        if(!k.Houses[kHouse]) k.Houses[kHouse] = [];
        k.Houses[kHouse].push("Ketu");

        k.Lagna = { degree: lagnaDeg.toFixed(2), rashi: rashis[lagnaRashiNum - 1], signNum: lagnaRashiNum };
        return k;
    } catch (err) { return null; }
}

// 3. CHART UI
function drawKundliChart(k) {
    const canvas = createCanvas(800, 800);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "white"; ctx.fillRect(0, 0, 800, 800);
    ctx.strokeStyle = "#8B0000"; ctx.lineWidth = 5;
    ctx.strokeRect(50, 50, 700, 700);
    ctx.beginPath();
    ctx.moveTo(50, 50); ctx.lineTo(750, 750); ctx.moveTo(750, 50); ctx.lineTo(50, 750);
    ctx.moveTo(400, 50); ctx.lineTo(50, 400); ctx.lineTo(400, 750); ctx.lineTo(750, 400); ctx.lineTo(400, 50);
    ctx.stroke();
    const houseCoords = { 1:[400,250], 2:[250,150], 3:[150,250], 4:[250,400], 5:[150,550], 6:[250,650], 7:[400,550], 8:[550,650], 9:[650,550], 10:[550,400], 11:[650,250], 12:[550,150] };
    ctx.textAlign = "center";
    for (let h in houseCoords) {
        ctx.fillStyle = "#8B0000"; ctx.font = "bold 32px Serif";
        let rashiNo = (k.Lagna.signNum + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rashiNo, houseCoords[h][0], houseCoords[h][1] + 50);
        ctx.fillStyle = "black"; ctx.font = "20px Arial";
        (k.Houses[h] || []).forEach((p, i) => ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 25)));
    }
    return canvas.toBuffer("image/png");
}

// 4. CHAT (ASLI ANSWERS)
app.post("/chat", async (req, res) => {
    const { message, dob, time, place } = req.body;
    const k = generateKundli(dob, time, place);
    if(!k) return res.json({reply: "Data missing, beta."});

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [
                    { role: "system", content: `You are 'Ask Baba', a world-class Vedic Astrologer. Analyze this Real Kundli: ${JSON.stringify(k)}.
                    Personality Rules:
                    - Give REAL, deep Vedic predictions based on house placements (e.g., Saturn in 7th means marriage delay).
                    - Use Hinglish like a learned Pandit.
                    - Mention specific planets and their effects.
                    - Always provide 1 specific 'Upay' (Remedy).
                    - Start with 'Narayan Narayan' or 'Ashirwad'.` },
                    { role: "user", content: message }
                ]
            })
        });
        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (e) { res.json({ reply: "Beta, dhyan mein vighna aa gaya." }); }
});

app.post("/download-kundli", (req, res) => {
    const k = generateKundli(req.body.dob, req.body.time, req.body.place);
    if(!k) return res.status(500).send("Error");
    res.set("Content-Type", "image/png");
    res.send(drawKundliChart(k));
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Professional Baba live on ${PORT}`));