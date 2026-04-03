const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");
const path = require("path");

// Ephemeris Setup
swe.swe_set_ephe_path(path.join(__dirname, "ephe"));
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI);

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🚀 Ask Baba Backend is Live and Powerful");
});

/* 🌍 LOCATION DATABASE */
const locationMap = {
  "Agra": { lat: 27.1767, lon: 78.0081 },
  "Delhi": { lat: 28.6139, lon: 77.2090 },
  "Mumbai": { lat: 19.0760, lon: 72.8777 },
  "Bangalore": { lat: 12.9716, lon: 77.5946 },
  "Kolkata": { lat: 22.5726, lon: 88.3639 }
};

/* 🔢 CALCULATION HELPERS */
function getJulianDay(dob, time) {
  const [d, m, y] = dob.split("/").map(Number);
  const [h, min] = time.split(":").map(Number);
  return swe.swe_julday(y, m, d, h + min / 60, swe.SE_GREG_CAL);
}

const rashis = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];

function getPlanets(jd) {
  const planetsMap = {
    Sun: swe.SE_SUN, Moon: swe.SE_MOON, Mars: swe.SE_MARS,
    Mercury: swe.SE_MERCURY, Jupiter: swe.SE_JUPITER,
    Venus: swe.SE_VENUS, Saturn: swe.SE_SATURN, Rahu: swe.SE_MEAN_NODE
  };

  let result = {};
  for (let p in planetsMap) {
    let xx = new Array(6);
    let serr = "";
    // Using Sidereal (Vedic) flag
    swe.swe_calc_ut(jd, planetsMap[p], swe.SEFLG_SWIEPH | swe.SEFLG_SIDEREAL, xx, serr);
    result[p] = { deg: xx[0] };
  }
  return result;
}

function getLagna(jd, lat, lon) {
  let cusps = new Array(13);
  let ascmc = new Array(10);
  swe.swe_houses_ex(jd, swe.SEFLG_SIDEREAL, lat, lon, 'P', cusps, ascmc);
  return ascmc[0];
}

/* 🔮 KUNDLI GENERATION LOGIC */
function generateKundli(dob, time, place) {
  const loc = locationMap[place] || locationMap["Delhi"];
  const jd = getJulianDay(dob, time);
  const planetsRaw = getPlanets(jd);
  const lagnaDeg = getLagna(jd, loc.lat, loc.lon);

  let k = { Planets: {}, Houses: {} };
  const lagnaSign = Math.floor(lagnaDeg / 30) + 1;

  for (let p in planetsRaw) {
    let pDeg = planetsRaw[p].deg;
    let rashiIdx = Math.floor(pDeg / 30);
    // Calculate House (Bhav) relative to Lagna
    let house = Math.floor((pDeg - (lagnaSign-1)*30 + 360) % 360 / 30) + 1;
    
    k.Planets[p] = {
      degree: pDeg.toFixed(2),
      rashi: rashis[rashiIdx],
      house: house
    };
    
    if(!k.Houses[house]) k.Houses[house] = [];
    k.Houses[house].push(p);
  }

  k.Lagna = { degree: lagnaDeg.toFixed(2), rashi: rashis[lagnaSign-1], signNum: lagnaSign };
  return k;
}

/* 🎨 DRAWING THE KUNDLI (NORTH INDIAN STYLE) */
function drawKundliChart(k) {
  const canvas = createCanvas(600, 600);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 600, 600);

  // Draw Kundli Square & Lines
  ctx.strokeStyle = "#b30000"; // Vedic Red
  ctx.lineWidth = 3;
  ctx.strokeRect(50, 50, 500, 500);

  ctx.beginPath();
  // Diagonals
  ctx.moveTo(50, 50); ctx.lineTo(550, 550);
  ctx.moveTo(550, 50); ctx.lineTo(50, 550);
  // Diamond
  ctx.moveTo(300, 50); ctx.lineTo(50, 300);
  ctx.lineTo(300, 550); ctx.lineTo(550, 300);
  ctx.lineTo(300, 50);
  ctx.stroke();

  // Draw Planet Names in Houses
  ctx.fillStyle = "#000";
  ctx.font = "14px Arial";
  ctx.textAlign = "center";

  const houseCoords = {
    1: [300, 180], 2: [200, 100], 3: [100, 200], 4: [180, 300],
    5: [100, 400], 6: [200, 500], 7: [300, 420], 8: [400, 500],
    9: [500, 400], 10: [420, 300], 11: [500, 200], 12: [400, 100]
  };

  for (let h in houseCoords) {
    let pList = k.Houses[h] || [];
    let text = pList.join(", ");
    ctx.fillText(text, houseCoords[h][0], houseCoords[h][1]);
  }

  // Draw Lagna Sign Number in the first house
  ctx.fillStyle = "#b30000";
  ctx.font = "bold 18px Arial";
  ctx.fillText(k.Lagna.signNum, 300, 210);

  return canvas.toBuffer("image/png");
}

/* 📥 DOWNLOAD ENDPOINT */
app.post("/download-kundli", (req, res) => {
  try {
    const { dob, time, place } = req.body;
    if(!dob || !time) return res.status(400).send("Details missing");

    const k = generateKundli(dob, time, place);
    const imgBuffer = drawKundliChart(k);

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Content-Disposition", "attachment; filename=my_kundli.png");
    res.send(imgBuffer);
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating Kundli");
  }
});

/* 💬 CHAT (BABA AI) */
app.post("/chat", async (req, res) => {
  const { message, dob, time, place } = req.body;

  try {
    const k = generateKundli(dob, time, place);

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
            content: `You are 'Ask Baba', a legendary Indian Vedic Astrologer. 
            Use this Kundli Data: ${JSON.stringify(k)}. 
            Your personality:
            - Speak in a mix of Hindi and English (Hinglish).
            - Use words like 'Beta', 'Shani ki drishti', 'Yog', 'Ashirwad'.
            - Give deep, specific predictions about Career, Marriage, and Health based on planet houses.
            - If Shani (Saturn) or Rahu is in a tough house, warn them and give a simple remedy (Upay).
            - Be 100% confident and mystical.`
          },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();
    res.json({
      reply: data?.choices?.[0]?.message?.content || "Baba abhi dhyan mein hain, thodi der baad puchiye."
    });

  } catch (err) {
    console.error(err);
    res.json({ reply: "Beta, server mein thoda dosh hai. Phir se koshish karo." });
  }
});

/* 🚀 START SERVER */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Ask Baba is running on port ${PORT}`);
});