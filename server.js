const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- ⚙️ CONFIGURATION ---
// Ephemeris path set karna zaroori hai bhale hi files kam hon
const ephePath = path.resolve(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

// --- 🔢 REAL CALCULATION ENGINE (Moshier Mode) ---
function generateAsliKundli(dob, time) {
    try {
        // Date parsing (DD/MM/YYYY support)
        const parts = dob.split(/[\/\-]/);
        const d = parseInt(parts[0]);
        const m = parseInt(parts[1]);
        const y = parseInt(parts[2]);
        const tParts = time.split(":");
        const h = parseInt(tParts[0]);
        const min = parseInt(tParts[1]);

        // India Time Correction (IST to UTC) - Sabse Important!
        const ut = (h + min / 60) - 5.5;
        const jd = swe.swe_julday(y, m, d, ut, swe.SE_GREG_CAL);

        if (isNaN(jd)) return null;

        // Force Flags: SEFLG_MOSEPH ensures no 0.00 degrees even without files
        const calcFlag = swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH;
        
        let k = { Planets: {}, Houses: {}, Lagna: {}, Dasha: "", DOB: dob, Time: time };

        // 1. Lagna Calculation (Agra Coordinates)
        let cusps = new Array(13), ascmc = new Array(10);
        swe.swe_houses_ex(jd, calcFlag, 27.1767, 78.0081, 'P', cusps, ascmc);
        const lagnaDeg = ascmc[0];
        const lagnaSign = Math.floor(lagnaDeg / 30) + 1;

        // 2. Planets Calculation
        const planets = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };
        
        for (let p in planets) {
            let xx = new Array(6), serr = "";
            swe.swe_calc_ut(jd, planets[p], calcFlag, xx, serr);
            
            let pDeg = xx[0];
            let pRashi = Math.floor(pDeg / 30) + 1;
            let house = (pRashi - lagnaSign + 12) % 12 + 1;

            k.Planets[p] = {
                deg: pDeg.toFixed(2),
                rashi: rashis[pRashi - 1],
                house: house
            };

            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(p);

            // Dasha Calculation from Moon degree
            if (p === "Moon") {
                const nakIndex = Math.floor(pDeg / (360/27));
                k.Dasha = dashaLords[nakIndex % 9];
            }
        }

        // 3. Ketu Fix
        let rahuDeg = parseFloat(k.Planets.Rahu.deg);
        let ketuDeg = (rahuDeg + 180) % 360;
        let kRashi = Math.floor(ketuDeg / 30) + 1;
        let kHouse = (kRashi - lagnaSign + 12) % 12 + 1;
        k.Planets["Ketu"] = { deg: ketuDeg.toFixed(2), rashi: rashis[kRashi-1], house: kHouse };
        if(!k.Houses[kHouse]) k.Houses[kHouse] = [];
        k.Houses[kHouse].push("Ketu");

        k.Lagna = { sign: lagnaSign, name: rashis[lagnaSign-1], deg: lagnaDeg.toFixed(2) };
        return k;
    } catch (e) {
        console.error(e);
        return null;
    }
}

// --- 🎨 CHART UI ---
function drawKundli(k) {
    const canvas = createCanvas(800, 1100);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0,0,800,1100);
    
    // Draw Box & Lines
    ctx.strokeStyle = "#800"; ctx.lineWidth = 6;
    ctx.strokeRect(50,50,700,700);
    ctx.beginPath();
    ctx.moveTo(50,50); ctx.lineTo(750,750); ctx.moveTo(750,50); ctx.lineTo(50,750);
    ctx.moveTo(400,50); ctx.lineTo(50,400); ctx.lineTo(400,750); ctx.lineTo(750,400); ctx.lineTo(400,50);
    ctx.stroke();

    const houseCoords = { 1:[400,250], 2:[250,130], 3:[130,250], 4:[250,400], 5:[130,550], 6:[250,670], 7:[400,550], 8:[550,670], 9:[670,550], 10:[550,400], 11:[670,250], 12:[550,130] };
    
    for(let h in houseCoords) {
        ctx.fillStyle = "#800"; ctx.font = "bold 40px Serif"; ctx.textAlign = "center";
        let rNo = (k.Lagna.sign + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rNo, houseCoords[h][0], houseCoords[h][1] + 55);
        
        ctx.fillStyle = "#000"; ctx.font = "bold 18px Arial";
        (k.Houses[h] || []).forEach((p, i) => ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 24)));
    }

    // Info Table
    ctx.textAlign = "left"; ctx.fillStyle = "#000"; ctx.font = "bold 22px Arial";
    ctx.fillText(`Lagna: ${k.Lagna.name} | Janm Dasha: ${k.Dasha}`, 60, 800);
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
    // Extract info if not direct
    let d = dob, t = time;
    if(!d) {
        const dm = message.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
        const tm = message.match(/(\d{1,2}:\d{2})/);
        d = dm ? dm[0] : "01/01/2000"; t = tm ? tm[0] : "12:00";
    }

    const k = generateAsliKundli(d, t);
    if(!k) return res.json({ reply: "Beta, tithi sahi se batayein." });

    try {
        const ai = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{ role: "system", content: `You are 'Ask Baba', a Real Vedic Pandit. Data: ${JSON.stringify(k)}. Give 100% accurate predictions about Finance and Marriage using this real data. Hinglish tone.` }, { role: "user", content: message }]
            })
        });
        const data = await ai.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (e) { res.json({ reply: "Dhyan mein vighna hai." }); }
});

app.post("/download-kundli", (req, res) => {
    const k = generateAsliKundli(req.body.dob, req.body.time);
    if(!k) return res.status(400).send("Error");
    const buf = drawKundli(k);
    res.set({"Content-Type":"image/png", "Content-Length": buf.length});
    res.end(buf);
});

app.get("/", (req, res) => res.send("🚀 Asli Baba Backend Live!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`Live on ${PORT}`));
