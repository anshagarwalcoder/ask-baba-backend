const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// --- 🛠 CONFIGURATION ---
const ephePath = path.resolve(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
const dashaLords = ["Ketu", "Venus", "Sun", "Moon", "Mars", "Rahu", "Jupiter", "Saturn", "Mercury"];

// Smart Parser: User input se data nikalne ke liye
function parseUserData(input) {
    if (!input) return null;
    const parts = input.split(",").map(p => p.trim());
    if (parts.length < 3) return null;

    return {
        name: parts[0],
        dob: parts[1],  // Expected DD/MM/YYYY
        time: parts[2], // Expected HH:MM
        place: parts[3] || "Delhi"
    };
}

// Julian Day with IST (-5.5) Correction
function getJD(dob, time) {
    try {
        const [d, m, y] = dob.split(/[\/\-]/).map(Number);
        const [h, min] = time.split(":").map(Number);
        const ut = (h + min / 60) - 5.5;
        return swe.swe_julday(y, m, d, ut, swe.SE_GREG_CAL);
    } catch (e) { return null; }
}

// 🔢 REAL VEDIC CALCULATION
function generateKundli(dob, time, place) {
    const jd = getJD(dob, time);
    if (!jd) return null;

    const lat = 27.1767, lon = 78.0081; // Default Agra
    let k = { Planets: {}, Houses: {}, Lagna: {}, Dasha: "" };

    try {
        let cusps = new Array(13), ascmc = new Array(10);
        // Using MOSEPH for 100% stability
        swe.swe_houses_ex(jd, swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH, lat, lon, 'P', cusps, ascmc);
        
        const lagnaDeg = ascmc[0] || 0;
        const lagnaRashi = Math.floor(lagnaDeg / 30) + 1;

        const planets = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };

        for (let p in planets) {
            let xx = new Array(6), serr = "";
            swe.swe_calc_ut(jd, planets[p], swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH, xx, serr);
            
            let pDeg = xx[0] || 0;
            let pRashi = Math.floor(pDeg / 30) + 1;
            let house = (pRashi - lagnaRashi + 12) % 12 + 1;

            k.Planets[p] = { deg: pDeg.toFixed(2), rashi: rashis[pRashi-1], house };
            if (!k.Houses[house]) k.Houses[house] = [];
            k.Houses[house].push(p);

            if (p === "Moon") {
                const nakIndex = Math.floor(pDeg / (360/27));
                k.Dasha = dashaLords[nakIndex % 9];
            }
        }

        // Ketu (Exactly opposite Rahu)
        let kDeg = (parseFloat(k.Planets.Rahu.deg) + 180) % 360;
        let kHouse = (Math.floor(kDeg / 30) + 1 - lagnaRashi + 12) % 12 + 1;
        k.Planets["Ketu"] = { deg: kDeg.toFixed(2), house: kHouse };
        if(!k.Houses[kHouse]) k.Houses[kHouse] = [];
        k.Houses[kHouse].push("Ketu");

        k.Lagna = { rashiNo: lagnaRashi, deg: lagnaDeg.toFixed(2) };
        return k;
    } catch (e) { return null; }
}

// 🎨 HIGH-QUALITY CHART
function drawChart(k) {
    const canvas = createCanvas(800, 1000);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0, 0, 800, 1000);
    
    // Draw Square
    ctx.strokeStyle = "#900"; ctx.lineWidth = 5;
    ctx.strokeRect(50, 50, 700, 700);
    ctx.beginPath();
    ctx.moveTo(50, 50); ctx.lineTo(750, 750); ctx.moveTo(750, 50); ctx.lineTo(50, 750);
    ctx.moveTo(400, 50); ctx.lineTo(50, 400); ctx.lineTo(400, 750); ctx.lineTo(750, 400); ctx.lineTo(400, 50);
    ctx.stroke();

    const houseCoords = { 1:[400,250], 2:[250,130], 3:[130,250], 4:[250,400], 5:[130,550], 6:[250,670], 7:[400,550], 8:[550,670], 9:[670,550], 10:[550,400], 11:[670,250], 12:[550,130] };
    
    for (let h in houseCoords) {
        ctx.fillStyle = "#900"; ctx.font = "bold 32px Serif"; ctx.textAlign = "center";
        let rNo = (k.Lagna.rashiNo + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rNo, houseCoords[h][0], houseCoords[h][1] + 40);
        
        ctx.fillStyle = "#000"; ctx.font = "18px Arial";
        (k.Houses[h] || []).forEach((p, i) => ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 22)));
    }

    // Info Text
    ctx.fillStyle = "#000"; ctx.font = "bold 24px Arial"; ctx.textAlign = "left";
    ctx.fillText(`Lagna: ${rashis[k.Lagna.rashiNo-1]} | Dasha: ${k.Dasha}`, 50, 800);
    ctx.font = "18px Arial";
    let y = 840;
    Object.keys(k.Planets).slice(0, 6).forEach(p => {
        ctx.fillText(`${p}: ${k.Planets[p].deg}° (${k.Planets[p].rashi})`, 50, y);
        y += 25;
    });

    return canvas.toBuffer("image/png");
}

// 📡 ROUTES
app.post("/chat", async (req, res) => {
    let { message, dob, time, place } = req.body;
    if (!dob) {
        const extracted = parseUserData(message);
        if (extracted) { dob = extracted.dob; time = extracted.time; place = extracted.place; }
    }

    const k = generateKundli(dob, time, place);
    if (!k) return res.json({ reply: "Beta, janam tithi (DD/MM/YYYY) aur samay sahi se batayein." });

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [{ role: "system", content: `You are 'Ask Baba', a Real Vedic Pandit. Data: ${JSON.stringify(k)}. Give 100% real predictions about Career, Money, and Marriage in Hinglish. Mention specific houses. Start with 'Narayan Narayan'.` }, { role: "user", content: message }]
            })
        });
        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (e) { res.json({ reply: "Dhyan mein vighna hai, beta." }); }
});

app.post("/download-kundli", (req, res) => {
    try {
        let { dob, time, place, message } = req.body;
        if (!dob) {
            const extracted = parseUserData(message);
            if (extracted) { dob = extracted.dob; time = extracted.time; place = extracted.place; }
        }
        const k = generateKundli(dob, time, place);
        if (!k) return res.status(400).send("Invalid Data");

        const imgBuffer = drawChart(k);
        res.writeHead(200, {
            "Content-Type": "image/png",
            "Content-Length": imgBuffer.length,
            "Content-Disposition": "attachment; filename=kundli.png"
        });
        res.end(imgBuffer); // End the stream properly
    } catch (e) {
        res.status(500).send("Drawing Failed");
    }
});

app.get("/", (req, res) => res.send("🚀 Backend is 100% Operational!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log(`Server live on ${PORT}`));