const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// 1. PATH SETUP: Fallback mechanism ke saath
const ephePath = path.join(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI);

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

// 2. JULIAN DAY: Robust parsing
function getJulianDay(dob, time) {
    try {
        let d, m, y;
        if (dob.includes("-")) {
            [y, m, d] = dob.split("-").map(Number);
        } else {
            [d, m, y] = dob.split("/").map(Number);
        }
        const [h, min] = (time || "12:00").split(":").map(Number);
        return swe.swe_julday(y, m, d, h + min / 60, swe.SE_GREG_CAL);
    } catch (e) {
        return 2451545.0; // Fallback
    }
}

// 3. KUNDLI LOGIC: Bina file ke chalne wala logic
function generateKundli(dob, time, place) {
    try {
        const lat = 28.6139; // Default Delhi
        const lon = 77.2090;
        const jd = getJulianDay(dob, time);
        
        let k = { Planets: {}, Houses: {} };
        
        // --- LAGNA CALCULATION ---
        let cusps = new Array(13), ascmc = new Array(10);
        // MOSEPH flag use kiya hai taaki bina files ke bhi result aaye
        swe.swe_houses_ex(jd, swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH, lat, lon, 'P', cusps, ascmc);
        
        const lagnaDeg = (ascmc && typeof ascmc[0] === 'number') ? ascmc[0] : 0;
        const lagnaSignNum = Math.floor(lagnaDeg / 30) + 1;

        // --- PLANET CALCULATION ---
        const planetsMap = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };

        for (let pName in planetsMap) {
            let xx = new Array(6), serr = "";
            // MOSEPH flag: Agar file nahi bhi hai, toh internal math se nikal lega
            let flag = swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH;
            
            swe.swe_calc_ut(jd, planetsMap[pName], flag, xx, serr);
            
            // Validation: Agar xx khali ho toh crash na ho
            let pDeg = (xx && typeof xx[0] === 'number') ? xx[0] : 0; 
            
            let house = Math.floor((pDeg - lagnaDeg + 360) % 360 / 30) + 1;
            
            k.Planets[pName] = { 
                degree: pDeg.toFixed(2), 
                rashi: rashis[Math.floor(pDeg / 30) % 12], 
                house: house 
            };
            
            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(pName);
        }

        k.Lagna = { 
            degree: lagnaDeg.toFixed(2), 
            rashi: rashis[(lagnaSignNum - 1) % 12], 
            signNum: lagnaSignNum 
        };
        return k;
    } catch (err) {
        console.error("Internal Logic Error:", err);
        return null;
    }
}

// 4. CHART DRAWING: Asli North Indian Chart
function drawKundliChart(k) {
    try {
        const canvas = createCanvas(600, 600);
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white"; ctx.fillRect(0, 0, 600, 600);
        ctx.strokeStyle = "#b30000"; ctx.lineWidth = 3;
        ctx.strokeRect(50, 50, 500, 500);
        
        ctx.beginPath(); // Chart Lines
        ctx.moveTo(50, 50); ctx.lineTo(550, 550); 
        ctx.moveTo(550, 50); ctx.lineTo(50, 550);
        ctx.moveTo(300, 50); ctx.lineTo(50, 300); ctx.lineTo(300, 550); ctx.lineTo(550, 300); ctx.lineTo(300, 50);
        ctx.stroke();

        ctx.fillStyle = "black"; ctx.font = "14px Arial"; ctx.textAlign = "center";
        const houseCoords = { 1: [300, 180], 2: [200, 100], 3: [100, 200], 4: [180, 300], 5: [100, 400], 6: [200, 500], 7: [300, 420], 8: [400, 500], 9: [500, 400], 10: [420, 300], 11: [500, 200], 12: [400, 100] };
        
        for (let h in houseCoords) {
            let pList = k.Houses[h] || [];
            ctx.fillText(pList.join(","), houseCoords[h][0], houseCoords[h][1]);
        }
        
        ctx.fillStyle = "red"; ctx.font = "bold 22px Arial";
        ctx.fillText(k.Lagna.signNum, 300, 215);
        
        return canvas.toBuffer("image/png");
    } catch (e) {
        return null;
    }
}

// 5. ROUTES
app.post("/download-kundli", async (req, res) => {
    try {
        const { dob, time, place } = req.body;
        const k = generateKundli(dob, time, place);
        if (!k) return res.status(500).send("Error");
        const img = drawKundliChart(k);
        res.set("Content-Type", "image/png");
        res.send(img);
    } catch (e) { res.status(500).send("Download Failed"); }
});

app.post("/chat", async (req, res) => {
    const { message, dob, time, place } = req.body;
    try {
        const k = generateKundli(dob, time, place);
        const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [
                    { role: "system", content: `You are 'Ask Baba', an expert Vedic Astrologer. Analyze: ${JSON.stringify(k)}. Give short Hinglish answers. Use words like Beta, Shani, Dosh, Upay.` },
                    { role: "user", content: message }
                ]
            })
        });
        const data = await r.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (err) {
        res.json({ reply: "Beta, server mein thoda dosh hai. Phir se koshish karo." });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`🚀 Baba is live on ${PORT}`));