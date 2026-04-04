
const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- 🛠 VEDIC CONFIG ---
const ephePath = path.resolve(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

// --- 🧠 SMART PARSER ---
function parseInput(message, dobIn, timeIn) {
    if (dobIn && timeIn && dobIn !== "") return { dob: dobIn, time: timeIn };
    const dMatch = message.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
    const tMatch = message.match(/(\d{1,2}:\d{2})/);
    return { 
        dob: dMatch ? dMatch[0] : "01/01/2000", 
        time: tMatch ? tMatch[0] : "12:00" 
    };
}

// --- 🔢 REAL CALCULATION (1960 - 2100 Support) ---
function generate100RealKundli(dob, time) {
    try {
        const [d, m, y] = dob.split(/[\/\-]/).map(Number);
        const [h, min] = time.split(":").map(Number);
        
        // IST to UTC (-5.5) - Professional standard for India
        const ut = (h + min / 60) - 5.5;
        const jd = swe.swe_julday(y, m, d, ut, swe.SE_GREG_CAL);

        if (isNaN(jd)) return null;

        let k = { Planets: {}, Houses: {}, Lagna: {}, Dasha: "", DOB: dob, Time: time };

        // 1. Lagna (Hardcoded Agra for 100% stability)
        let cusps = new Array(13), ascmc = new Array(10);
        swe.swe_houses_ex(jd, swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH, 27.1767, 78.0081, 'P', cusps, ascmc);
        const lagnaDeg = ascmc[0] || 0;
        const lagnaSign = Math.floor(lagnaDeg / 30) + 1;

        // 2. Planets Calculation
        const planets = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };
        
        for (let p in planets) {
            let xx = new Array(6), serr = "";
            swe.swe_calc_ut(jd, planets[p], swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH, xx, serr);
            
            let pDeg = xx[0] || 0;
            let pRashi = Math.floor(pDeg / 30) + 1;
            let house = (pRashi - lagnaSign + 12) % 12 + 1;

            k.Planets[p] = {
                deg: pDeg.toFixed(2),
                rashi: rashis[pRashi - 1],
                house: house
            };

            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(p);

            if (p === "Moon") {
                const nakIndex = Math.floor(pDeg / (360/27));
                k.Dasha = dashaLords[nakIndex % 9];
            }
        }

        // Ketu (Opposite Rahu)
        let rahuDeg = parseFloat(k.Planets.Rahu.deg);
        let ketuDeg = (rahuDeg + 180) % 360;
        let kRashi = Math.floor(ketuDeg / 30) + 1;
        let kHouse = (kRashi - lagnaSign + 12) % 12 + 1;
        k.Planets["Ketu"] = { deg: ketuDeg.toFixed(2), rashi: rashis[kRashi-1], house: kHouse };
        if(!k.Houses[kHouse]) k.Houses[kHouse] = [];
        k.Houses[kHouse].push("Ketu");

        k.Lagna = { signNo: lagnaSign, name: rashis[lagnaSign-1], deg: lagnaDeg.toFixed(2) };
        return k;
    } catch (e) { 
        return null; 
    }
}

// --- 🎨 PRO CHART DRAWING ---
function drawChart(k) {
    const canvas = createCanvas(800, 1000);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0, 0, 800, 1000);
    
    ctx.strokeStyle = "#800"; ctx.lineWidth = 6;
    ctx.strokeRect(50, 50, 700, 700);
    ctx.beginPath();
    ctx.moveTo(50, 50); ctx.lineTo(750, 750); ctx.moveTo(750, 50); ctx.lineTo(50, 750);
    ctx.moveTo(400, 50); ctx.lineTo(50, 400); ctx.lineTo(400, 750); ctx.lineTo(750, 400); ctx.lineTo(400, 50);
    ctx.stroke();

    const houseCoords = { 1:[400,250], 2:[250,130], 3:[130,250], 4:[250,400], 5:[130,550], 6:[250,670], 7:[400,550], 8:[550,670], 9:[670,550], 10:[550,400], 11:[670,250], 12:[550,130] };
    
    for (let h in houseCoords) {
        ctx.fillStyle = "#800"; ctx.font = "bold 40px Serif"; ctx.textAlign = "center";
        let rNo = (k.Lagna.signNo + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rNo, houseCoords[h][0], houseCoords[h][1] + 55);
        
        ctx.fillStyle = "#000"; ctx.font = "bold 18px Arial";
        let pList = k.Houses[h] || [];
        pList.forEach((p, i) => ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 24)));
    }

    ctx.textAlign = "left"; ctx.fillStyle = "#000"; ctx.font = "bold 22px Arial";
    ctx.fillText(`Lagna: ${k.Lagna.name} | Janm Dasha: ${k.Dasha}`, 60, 800);
    ctx.font = "18px Arial";
    let y = 850;
    Object.keys(k.Planets).forEach((p, i) => {
        let xPos = i < 5 ? 60 : 400;
        let yOffset = i < 5 ? i * 28 : (i-5) * 28;
        ctx.fillText(`${p}: ${k.Planets[p].deg}° (${k.Planets[p].rashi})`, xPos, y + yOffset);
    });

    return canvas.toBuffer("image/png");
}

// --- 📡 API ROUTES ---

app.post("/chat", async (req, res) => {
    try {
        const { message, dob, time } = req.body;
        const info = parseInput(message, dob, time);
        const k = generate100RealKundli(info.dob, info.time);

        if (!k) return res.json({ reply: "Beta, janam tithi (DD/MM/YYYY) aur samay (HH:MM) sahi se batayein." });

        const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
                        content: `You are 'Ask Baba', a legendary Vedic Pandit. Data: ${JSON.stringify(k)}. Give 100% real Vedic predictions about Career, Money, and Marriage. Start with 'Narayan Narayan'. Use Hinglish.` 
                    },
                    { role: "user", content: message }
                ]
            })
        });

        const data = await aiResponse.json();
        res.json({ reply: data.choices?.[0]?.message?.content || "Baba meditation mein hain." });
    } catch (e) {
        res.json({ reply: "Beta, dhyan mein vighna aa gaya. Phir pucho." });
    }
});

app.post("/download-kundli", (req, res) => {
    try {
        const info = parseInput(req.body.message, req.body.dob, req.body.time);
        const k = generate100RealKundli(info.dob, info.time);
        if (!k) return res.status(400).send("Invalid Data");

        const buffer = drawChart(k);
        res.writeHead(200, { "Content-Type": "image/png", "Content-Length": buffer.length });
        res.end(buffer);
    } catch (err) {
        res.status(500).send("Drawing Error");
    }
});

app.get("/", (req, res) => {
    res.send("🚀 Asli Baba Backend is 100% Operational!");
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server live on port ${PORT}`);
});