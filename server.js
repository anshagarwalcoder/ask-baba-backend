const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) => import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// Ephemeris & Vedic Config
const ephePath = path.join(__dirname, "ephe");
swe.swe_set_ephe_path(ephePath);
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI, 0, 0);

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

// --- 🧠 SMART PARSER (User ke message se details nikalne ke liye) ---
function extractInfo(text) {
    const dateRegex = /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/;
    const timeRegex = /(\d{1,2}:\d{2})/;
    const dateMatch = text.match(dateRegex);
    const timeMatch = text.match(timeRegex);
    
    // City nikalne ka jugaad (Last word after comma)
    const parts = text.split(",");
    const city = parts.length > 1 ? parts[parts.length - 1].trim() : "Delhi";

    return {
        dob: dateMatch ? dateMatch[0] : null,
        time: timeMatch ? timeMatch[0] : "12:00",
        place: city
    };
}

// --- 🔢 VEDIC MATH ENGINE ---
function getJulianDay(dob, time) {
    try {
        const dParts = dob.includes("-") ? dob.split("-").reverse() : dob.split("/");
        const [d, m, y] = dParts.map(Number);
        const [h, min] = time.split(":").map(Number);
        const utTime = (h + min / 60) - 5.5; // IST to UTC
        return swe.swe_julday(y, m, d, utTime, swe.SE_GREG_CAL);
    } catch(e) { return null; }
}

function generateKundli(dob, time, place) {
    const jd = getJulianDay(dob, time);
    if (!jd) return null;

    const lat = 27.1767, lon = 78.0081; // Ideally Agra, but can be dynamic
    let k = { Planets: {}, Houses: {}, Lagna: {}, Nakshatra: "" };

    // Lagna
    let cusps = new Array(13), ascmc = new Array(10);
    swe.swe_houses_ex(jd, swe.SEFLG_SIDEREAL, lat, lon, 'P', cusps, ascmc);
    const lagnaDeg = ascmc[0];
    const lagnaRashiNum = Math.floor(lagnaDeg / 30) + 1;

    const planetsMap = { Sun: 0, Moon: 1, Mars: 4, Mercury: 2, Jupiter: 5, Venus: 3, Saturn: 6, Rahu: 11 };

    for (let p in planetsMap) {
        let xx = new Array(6), serr = "";
        swe.swe_calc_ut(jd, planetsMap[p], swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL | swe.SEFLG_MOSEPH, xx, serr);
        let pDeg = xx[0];
        const pRashiNum = Math.floor(pDeg / 30) + 1;
        let house = (pRashiNum - lagnaRashiNum + 12) % 12 + 1;

        k.Planets[p] = { degree: pDeg.toFixed(2), rashi: rashis[pRashiNum-1], house };
        if(!k.Houses[house]) k.Houses[house] = [];
        k.Houses[house].push(p);

        if(p === "Moon") {
            const nakList = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","P.Phalguni","U.Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","P.Ashadha","U.Ashadha","Shravana","Dhanishta","Shatabhisha","P.Bhadra","U.Bhadra","Revati"];
            k.Nakshatra = nakList[Math.floor(pDeg / (360/27))];
        }
    }
    k.Lagna = { signNum: lagnaRashiNum, rashi: rashis[lagnaRashiNum-1] };
    return k;
}

// --- 🎨 ASLI KUNDLI UI ---
function drawChart(k) {
    const canvas = createCanvas(800, 800);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FFFBF2"; ctx.fillRect(0,0,800,800);
    ctx.strokeStyle = "#900"; ctx.lineWidth = 6;
    ctx.strokeRect(50,50,700,700);
    ctx.beginPath();
    ctx.moveTo(50,50); ctx.lineTo(750,750); ctx.moveTo(750,50); ctx.lineTo(50,750);
    ctx.moveTo(400,50); ctx.lineTo(50,400); ctx.lineTo(400,750); ctx.lineTo(750,400); ctx.lineTo(400,50);
    ctx.stroke();
    const houseCoords = { 1:[400,250], 2:[250,150], 3:[150,250], 4:[250,400], 5:[150,550], 6:[250,650], 7:[400,550], 8:[550,650], 9:[650,550], 10:[550,400], 11:[650,250], 12:[550,150] };
    ctx.textAlign = "center";
    for(let h in houseCoords) {
        ctx.fillStyle = "#900"; ctx.font = "bold 35px Serif";
        let rNo = (k.Lagna.signNum + parseInt(h) - 2) % 12 + 1;
        ctx.fillText(rNo, houseCoords[h][0], houseCoords[h][1] + 50);
        ctx.fillStyle = "black"; ctx.font = "22px Arial";
        (k.Houses[h] || []).forEach((p, i) => ctx.fillText(p, houseCoords[h][0], houseCoords[h][1] - (i * 28)));
    }
    return canvas.toBuffer("image/png");
}

// --- 📡 ROUTES ---
app.post("/chat", async (req, res) => {
    let { message, dob, time, place } = req.body;

    // AGAR DATA MISSING HAI, TOH MESSAGE SE NIKALO
    if(!dob || dob === "") {
        const info = extractInfo(message);
        dob = info.dob; time = info.time; place = info.place;
    }

    if(!dob) return res.json({ reply: "Beta, apni janam tithi (DD/MM/YYYY) aur samay sahi se batao." });

    const k = generateKundli(dob, time, place);
    if(!k) return res.json({ reply: "Beta, kundli ki ganana mein vighna hai. Details check karo." });

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "openai/gpt-4o-mini",
                messages: [
                    { role: "system", content: `You are 'Ask Baba', an expert Vedic Astrologer. Data: ${JSON.stringify(k)}. 
                    - Provide deep insights about Financial Condition, Career, and Love.
                    - Use planet names and houses (e.g., 'Aapka Shani 8th house mein hai').
                    - Talk in respectful, mystical Hinglish. 
                    - Give a specific Upay (remedy).` },
                    { role: "user", content: message }
                ]
            })
        });
        const data = await response.json();
        res.json({ reply: data.choices[0].message.content });
    } catch (e) { res.json({ reply: "Dhyan mein vighna aa gaya, beta." }); }
});

app.post("/download-kundli", (req, res) => {
    let { dob, time, place, message } = req.body;
    if(!dob && message) {
        const info = extractInfo(message);
        dob = info.dob; time = info.time; place = info.place;
    }
    const k = generateKundli(dob, time, place);
    if(!k) return res.status(400).send("Invalid Data");
    res.set("Content-Type", "image/png");
    res.send(drawChart(k));
});

app.get("/", (req, res) => res.send("🚀 Baba is Active!"));

const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => console.log("Professional Server Running"));