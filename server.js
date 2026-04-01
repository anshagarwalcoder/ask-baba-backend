const express = require("express");
const cors = require("cors");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const PDFDocument = require("pdfkit");
const multer = require("multer");
const fs = require("fs");
const swe = require("swisseph");



swe.swe_set_ephe_path(__dirname + "/ephe");
console.log("Swiss Ephemeris loaded ✅");

const app = express();
app.use(cors());
app.use(express.json());

/* 🌍 LOCATION */
const locationMap = {
  Agra: { lat: 27.1767, lon: 78.0081 },
  Delhi: { lat: 28.6139, lon: 77.2090 }
};

/* 🔢 JULIAN DAY */
function getJulianDay(dob, time) {
  const [day, month, year] = dob.split("/").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  return swe.swe_julday(year, month, day, hour + minute / 60, swe.SE_GREG_CAL);
}

/* 🪐 PLANETS */
function getPlanets(jd) {
  const planets = {
    Sun: swe.SE_SUN,
    Moon: swe.SE_MOON,
    Mars: swe.SE_MARS,
    Mercury: swe.SE_MERCURY,
    Jupiter: swe.SE_JUPITER,
    Venus: swe.SE_VENUS,
    Saturn: swe.SE_SATURN
  };

  let result = {};

  for (let p in planets) {
    const res = swe.swe_calc_ut(jd, planets[p]);
    result[p] = res.longitude;
  }

  return result;
}

/* 🌅 LAGNA */
function getLagnaReal(jd, lat, lon) {
  const houses = swe.swe_houses(jd, lat, lon, 'P');
  return houses.ascendant;
}

/* ♈ RASHI */
const rashis = [
  "Aries","Taurus","Gemini","Cancer",
  "Leo","Virgo","Libra","Scorpio",
  "Sagittarius","Capricorn","Aquarius","Pisces"
];

function getRashi(deg) {
  return rashis[Math.floor(deg / 30)];
}

/* 🏠 HOUSE */
function getHouse(planetDeg, lagnaDeg) {
  let diff = planetDeg - lagnaDeg;
  if (diff < 0) diff += 360;
  return Math.floor(diff / 30) + 1;
}

/* 🔮 KUNDLI */
function generateKundli(dob, time, place) {
  const { lat, lon } = locationMap[place] || locationMap["Agra"];

  const jd = getJulianDay(dob, time);
  const planets = getPlanets(jd);
  const lagnaDeg = getLagnaReal(jd, lat, lon);

  let kundli = {};

  for (let p in planets) {
    kundli[p] = {
      degree: planets[p],
      rashi: getRashi(planets[p]),
      house: getHouse(planets[p], lagnaDeg)
    };
  }

  kundli["Lagna"] = {
    degree: lagnaDeg,
    rashi: getRashi(lagnaDeg)
  };

  return kundli;
}

/* 💍 MARRIAGE */
function marriagePrediction(kundli) {
  const venus = kundli.Venus;
  const moon = kundli.Moon;

  if (venus.house === 7 || moon.house === 7)
    return "Shaadi strong yog hai 💍";

  if (venus.house === 6 || venus.house === 8)
    return "Shaadi me delay ya challenges ⚠";

  return "Normal marriage yog 👍";
}

/* ❤️ COMPATIBILITY */
function compatibility(k1, k2) {
  let score = 0;

  if (k1.Moon.rashi === k2.Moon.rashi) score += 8;
  if (k1.Lagna.rashi === k2.Lagna.rashi) score += 7;
  if (k1.Venus.rashi === k2.Mars.rashi) score += 5;

  if (score >= 15) return "💖 Strong match";
  if (score >= 10) return "🙂 Average match";
  return "⚠ Weak match";
}

/* 🔮 DASHA */
function getDasha(moonDeg) {
  const dashaOrder = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"];
  const index = Math.floor(moonDeg / 40) % 9;
  return dashaOrder[index];
}


/* 💬 CHAT */
app.post("/chat", async (req, res) => {
  const { message, name, dob, time, place } = req.body;

  const kundli = generateKundli(dob, time, place);
  const dasha = getDasha(kundli.Moon.degree);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `
Tum ek jyotish ho.

DATA:
${JSON.stringify(kundli)}

DASHA: ${dasha}

Short aur direct answer do.
`
          },
          { role: "user", content: message }
        ]
      })
    });

    const data = await response.json();

    let reply = data?.choices?.[0]?.message?.content || "Answer nahi mila";

    res.json({
      reply,
      kundli,
      dasha,
      marriage: marriagePrediction(kundli)
    });

  } catch (err) {
    res.json({
      reply: "Server error",
      marriage: marriagePrediction(kundli)
    });
  }
});

/* ❤️ MATCH */
app.post("/match", (req, res) => {
  const { p1, p2 } = req.body;

  const k1 = generateKundli(p1.dob, p1.time, p1.place);
  const k2 = generateKundli(p2.dob, p2.time, p2.place);

  res.json({
    result: compatibility(k1, k2)
  });
});

/* 🖼️ IMAGE API */
app.post("/kundli-image", (req, res) => {
  const { dob, time, place } = req.body;

  const kundli = generateKundli(dob, time, place);
  const img = drawKundli(kundli);

  res.setHeader("Content-Type", "image/png");
  res.send(img);
});

/* 🚀 START */
app.listen(3000, "0.0.0.0", () => {
  console.log("Server running 🚀");
});
