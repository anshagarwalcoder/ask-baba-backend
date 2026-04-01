const express = require("express");
const cors = require("cors");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const PDFDocument = require("pdfkit");
const multer = require("multer");
const fs = require("fs");
const swe = require("swisseph");

swe.swe_set_ephe_path(__dirname + "/ephe");
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI);

console.log("Swiss Ephemeris loaded ✅");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("🚀 Ask Baba Backend Running");
});

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

/* 🪐 PLANETS (SIDEREAL) */
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

  const ayan = swe.swe_get_ayanamsa(jd);
  let result = {};

  for (let p in planets) {
    const res = swe.swe_calc_ut(jd, planets[p]);
    let sidereal = res.longitude - ayan;
    if (sidereal < 0) sidereal += 360;
    result[p] = sidereal;
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

/* 🌙 NAKSHATRA + PADA */
const nakshatras = [
"Ashwini","Bharani","Krittika","Rohini","Mrigashira",
"Ardra","Punarvasu","Pushya","Ashlesha","Magha",
"Purva Phalguni","Uttara Phalguni","Hasta","Chitra",
"Swati","Vishakha","Anuradha","Jyeshtha","Mula",
"Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta",
"Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"
];

function getNakshatraDetails(deg) {
  const index = Math.floor(deg / (360 / 27));
  const pada = Math.floor((deg % (360/27)) / (360/108)) + 1;
  return {
    nakshatra: nakshatras[index],
    pada
  };
}

/* 🏠 HOUSE */
function getHouse(planetDeg, lagnaDeg) {
  let diff = planetDeg - lagnaDeg;
  if (diff < 0) diff += 360;
  return Math.floor(diff / 30) + 1;
}

/* 🔮 NAVAMSA */
function getNavamsa(deg) {
  const sign = Math.floor(deg / 30);
  const nav = Math.floor((deg % 30) / (30/9));
  return rashis[(sign * 9 + nav) % 12];
}

/* 🔮 DASHA */
const dashaOrder = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"];
const dashaYears = {
  Ketu: 7, Venus: 20, Sun: 6, Moon: 10,
  Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17
};

function getMahadasha(moonDeg) {
  const index = Math.floor(moonDeg / (360 / 27)) % 9;
  const dasha = dashaOrder[index];
  return {
    current: dasha,
    duration: dashaYears[dasha] + " years"
  };
}

/* 🔮 KUNDLI */
function generateKundli(dob, time, place) {
  const { lat, lon } = locationMap[place] || locationMap["Agra"];

  const jd = getJulianDay(dob, time);
  const planets = getPlanets(jd);
  const lagnaDeg = getLagnaReal(jd, lat, lon);

  let kundli = {};

  for (let p in planets) {
    const nak = getNakshatraDetails(planets[p]);

    kundli[p] = {
      degree: planets[p],
      rashi: getRashi(planets[p]),
      house: getHouse(planets[p], lagnaDeg),
      nakshatra: nak.nakshatra,
      pada: nak.pada,
      navamsa: getNavamsa(planets[p])
    };
  }

  kundli.Lagna = {
    degree: lagnaDeg,
    rashi: getRashi(lagnaDeg),
    navamsa: getNavamsa(lagnaDeg)
  };

  kundli.Dasha = getMahadasha(kundli.Moon.degree);

  return kundli;
}

/* 💍 MARRIAGE */
function marriagePrediction(kundli) {
  const venus = kundli.Venus.house;

  if (venus === 7) return "Strong marriage yog 💍";
  if ([6,8,12].includes(venus)) return "Marriage delay possible ⚠";
  if (["Venus","Moon"].includes(kundli.Dasha.current)) return "Marriage time active 💍";

  return "Normal marriage 👍";
}

/* ⚠ MANGAL DOSH */
function isManglik(kundli) {
  return [1,4,7,8,12].includes(kundli.Mars.house)
    ? "Manglik ⚠"
    : "No Manglik ✅";
}

/* ❤️ DEEP COMPATIBILITY */
function deepCompatibility(k1, k2) {
  let score = 0;

  if (k1.Moon.rashi === k2.Moon.rashi) score += 7;
  if (k1.Moon.nakshatra === k2.Moon.nakshatra) score += 8;
  if (k1.Venus.navamsa === k2.Mars.navamsa) score += 6;
  if (k1.Venus.rashi === k2.Mars.rashi) score += 5;

  return {
    score,
    verdict:
      score >= 20 ? "Excellent Match 💖" :
      score >= 15 ? "Good Match 🙂" :
      "Weak Match ⚠"
  };
}

/* ❤️ GUNA MILAN */
function gunaMilan(k1, k2) {
  let score = 0;
  if (k1.Moon.nakshatra === k2.Moon.nakshatra) score += 8;
  if (k1.Moon.rashi === k2.Moon.rashi) score += 7;
  if (k1.Lagna.rashi === k2.Lagna.rashi) score += 6;

  return `${score}/36`;
}

/* 💬 CHAT */
app.post("/chat", (req, res) => {
  const { dob, time, place } = req.body;

  const kundli = generateKundli(dob, time, place);

  res.json({
    kundli,
    dasha: kundli.Dasha,
    marriage: marriagePrediction(kundli),
    manglik: isManglik(kundli)
  });
});

/* ❤️ MATCH */
app.post("/match", (req, res) => {
  const { p1, p2 } = req.body;

  const k1 = generateKundli(p1.dob, p1.time, p1.place);
  const k2 = generateKundli(p2.dob, p2.time, p2.place);

  res.json({
    deep: deepCompatibility(k1, k2),
    guna: gunaMilan(k1, k2),
    manglik: {
      p1: isManglik(k1),
      p2: isManglik(k2)
    }
  });
});

/* 🚀 START */
const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running 🚀 on port", PORT);
});
