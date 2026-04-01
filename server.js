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

app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

const upload = multer({ dest: "uploads/" });

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

/* 🌅 LAGNA REAL */
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
      rashi: getRashi(planets[p])
    };
  }

  kundli["Lagna"] = {
    degree: lagnaDeg,
    rashi: getRashi(lagnaDeg)
  };

  return kundli;
}

/* 🔮 CATEGORY */
function detectCategory(message) {
  message = message.toLowerCase();

  if (message.includes("love") || message.includes("pyar")) return "LOVE";
  if (message.includes("career") || message.includes("job")) return "CAREER";
  if (message.includes("money") || message.includes("paise")) return "MONEY";

  return "GENERAL";
}

/* 💬 CHAT */
app.post("/chat", async (req, res) => {
  const { message, name, dob, time, place } = req.body;

  console.log("🔥 CHAT HIT");

  const kundli = generateKundli(dob, time, place);
  const category = detectCategory(message);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo",
        temperature: 0.8,
        messages: [
          {
            role: "system",
            content: `
Tum ek experienced jyotish ho.

REAL DATA:
${JSON.stringify(kundli)}

RULES:
- Hinglish
- Short
- Confident
- Direct prediction

CATEGORY: ${category}

LOVE → relationship
CAREER → job
MONEY → finance
GENERAL → overall life
`
          },
          {
            role: "user",
            content: message
          }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.json({
        reply: generateFallback(kundli, category)
      });
    }

    let reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      reply = generateFallback(kundli, category);
    }

    res.json({ reply, kundli });

  } catch (err) {
    console.log(err);

    res.json({
      reply: generateFallback(kundli, category)
    });
  }
});

/* 🧠 FALLBACK (REAL RULES) */
function generateFallback(kundli, category) {
  const lagna = kundli.Lagna.rashi;
  const moon = kundli.Moon.rashi;

  if (category === "LOVE") {
    return `Dekhiye, aapka Moon ${moon} mein hai, emotions strong hain. Relationship mein thoda patience rakhein, 2-3 weeks mein situation improve hogi.`;
  }

  if (category === "CAREER") {
    return `Aapka Lagna ${lagna} strong hai. Career growth next 3 months mein dikhegi.`;
  }

  if (category === "MONEY") {
    return `Financial flow stable rahega, par unnecessary kharch avoid karein.`;
  }

  return `Overall kundli stable hai. Growth gradual hogi.`;
}

/* 📄 PDF */
app.post("/kundli", (req, res) => {
  const { name, dob, place } = req.body;

  const doc = new PDFDocument();
  const filePath = `kundli_${Date.now()}.pdf`;

  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(22).text("🔮 Real Kundli Report", { align: "center" });

  doc.text(`Name: ${name}`);
  doc.text(`DOB: ${dob}`);
  doc.text(`Place: ${place}`);

  doc.text("\nDetailed astrology analysis generated.");

  doc.end();

  setTimeout(() => res.download(filePath), 1000);
});

/* 📤 UPLOAD */
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ message: "Uploaded ✅" });
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running 🚀");
});
