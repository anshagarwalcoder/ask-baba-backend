const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- REAL VEDIC CONFIGURATION ---
const ephePath = path.join(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
// Lahiri Ayanamsa set karna sabse zaroori hai "Real" results ke liye
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0); 

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

// Location Data (Inhe aur accurate banaya hai)
const locationMap = {
  "Agra": { lat: 27.1767, lon: 78.0081 },
  "Delhi": { lat: 28.6139, lon: 77.2090 },
  "Mumbai": { lat: 19.0760, lon: 72.8777 },
  "Bangalore": { lat: 12.9716, lon: 77.5946 }
};

// 1. Precise Julian Day
function getJulianDay(dob, time) {
    const dParts = dob.includes("-") ? dob.split("-").reverse() : dob.split("/");
    const [d, m, y] = dParts.map(Number);
    const [h, min] = (time || "12:00").split(":").map(Number);
    // UTC conversion (India is +5:30, so subtracting it for Universal Time)
    const utTime = (h + min / 60) - 5.5; 
    return swe.swe_julday(y, m, d, utTime, swe.SE_GREG_CAL);
}

// 2. REAL VEDIC CALCULATION ENGINE
function generateKundli(dob, time, place) {
    try {
        const loc = locationMap[place] || locationMap["Delhi"];
        const jd = getJulianDay(dob, time);
        
        let k = { Planets: {}, Houses: {}, Lagna: {} };

        // --- STEP 1: Calculate Real Lagna ---
        let cusps = new Array(13), ascmc = new Array(10);
        // SEFLG_SIDEREAL ensures we use Vedic zodiac, not Western
        swe.swe_houses_ex(jd, swe.SEFLG_SIDEREAL, loc.lat, loc.lon, 'P', cusps, ascmc);
        
        const lagnaDeg = ascmc[0];
        const lagnaRashiNum = Math.floor(lagnaDeg / 30) + 1;

        // --- STEP 2: Calculate Planets ---
        const planetsMap = { 
            Sun: swe.SE_SUN, Moon: swe.SE_MOON, Mars: swe.SE_MARS, 
            Mercury: swe.SE_MERCURY, Jupiter: swe.SE_JUPITER, 
            Venus: swe.SE_VENUS, Saturn: swe.SE_SATURN, Rahu: swe.SE_MEAN_NODE 
        };

        for (let pName in planetsMap) {
            let xx = new Array(6), serr = "";
            // Use SWIEPH if files exist, fallback to MOSEPH for stability
            let flag = swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL;
            
            swe.swe_calc_ut(jd, planetsMap[pName], flag, xx, serr);
            let pDeg = xx[0];
            
            // Vedic House: Whole Sign System (Rashi decides the house)
            const pRashiNum = Math.floor(pDeg / 30) + 1;
            let house = (pRashiNum - lagnaRashiNum + 12) % 12 + 1;

            k.Planets[pName] = { 
                degree: pDeg.toFixed(2), 
                rashi: rashis[pRashiNum - 1], 
                house: house,
                rashiNum: pRashiNum
            };
            
            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(pName);
        }

        // Ketu calculation (Exactly 180 degrees from Rahu)
        let rahuDeg = parseFloat(k.Planets.Rahu.degree);
        let ketuDeg = (rahuDeg + 180) % 360;
        let ketuRashiNum = Math.floor(ketuDeg / 30) + 1;
        let ketuHouse = (ketuRashiNum - lagnaRashiNum + 12) % 12 + 1;
        
        k.Planets["Ketu"] = { degree: ketuDeg.toFixed(2), rashi: rashis[ketuRashiNum - 1], house: ketuHouse, rashiNum: ketuRashiNum };
        if (!k.Houses[ketuHouse]) k.Houses[ketuHouse] = [];
        k.Houses[ketuHouse].push("Ketu");

        k.Lagna = { degree: lagnaDeg.toFixed(2), rashi: rashis[lagnaRashiNum - 1], signNum: lagnaRashiNum };
        return k;
    } catch (err) {
        console.error("Calculation Error:", err);
        return null;
    }
}

// 3. PROFESSIONAL CHART DRAWING
function drawKundliChart(k) {
    const canvas = createCanvas(800, 800);
    const ctx = canvas.getContext("2d");

    // Background
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 800, 800);
    
    // Borders
    ctx.strokeStyle = "#990000"; ctx.lineWidth = 5;
    ctx.strokeRect(50, 50, 700, 700);
    
    // North Indian Style Lines
    ctx.beginPath();
    ctx.moveTo(50, 50); ctx.lineTo(750, 750);
    ctx.moveTo(750, 50); ctx.lineTo(50, 750);
    ctx.moveTo(400, 50); ctx.lineTo(50, 400); ctx.lineTo(400, 750); ctx.lineTo(750, 400); ctx.lineTo(400, 50);
    ctx.stroke();

    const houseCoords = {
        1: [400, 250], 2: [250, 150], 3: [150, 250], 4: [250, 400],
        5: [150, 550], 6: [250, 650], 7: [400, 550], 8: [550, 650],
        9: [650, 550], 10: [550, 400], 11: [650, 250], 12: [550, 150]
    };

    ctx.textAlign = "center";
    for (let h in houseCoords) {
        // House Sign Number (Asli Rashi Number)
        ctx.fillStyle = "#990000"; ctx.font = "bold 30px Serif";
        let rashiNo = (k.Lagna.signNum + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rashiNo, houseCoords[h][0], houseCoords[h][1] + 50);

        // Planets placement
        ctx.fillStyle = "#000000"; ctx.font = "20px Arial";
        let pList = k.Houses[h] || [];
        pList.forEach((p, i) => {
            ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 25));
        });
    }
    return canvas.toBuffer("image/png");
}

// 4. CHAT (HIGH-LEVEL ASTROLOGER AI)
app.post("/chat", async (req, res) => {
    const { message, dob, time, place } = req.body;
    const k = generateKundli(dob, time, place);

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
                    { 
                        role: "system", 
                        content: `You are 'Ask Baba', a highly accurate Vedic Astrologer. 
                        Analyze this Real Kundli: ${JSON.stringify(k)}.
                        Rules:
                        - Predict based on the 'House' each planet is in.
                        - Use Hindi/Sanskrit terms like 'Bhava', 'Drishti', 'Raja Yoga'.
                        - Be precise: If Saturn is in the 7th house, tell them about delays in marriage.
                        - Give an 'Upay' (Remedy) based on the weakest planet.
                        - Never say "I am an AI". Talk like a Guru.`
                    },
                    { role: "user", content: message }
                ]
            })
        });
        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (e) { res.json({ reply: "Beta, dasha theek nahi chal rahi server ki. Phir koshish karo." }); }
});

app.post("/download-kundli", (req, res) => {
    const k = generateKundli(req.body.dob, req.body.time, req.body.place);
    const img = drawKundliChart(k);
    res.set("Content-Type", "image/png");
    res.send(img);
});

app.listen(10000, "0.0.0.0", () => console.log("Professional Baba is Live"));