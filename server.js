const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");

swe.swe_set_ephe_path(__dirname + "/ephe");
swe.swe_set_sid_mode(swe.SE_SIDM_LAHIRI);

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

/* 🔢 JULIAN */
function getJulianDay(dob, time) {
  const [d, m, y] = dob.split("/").map(Number);
  const [h, min] = time.split(":").map(Number);
  return swe.swe_julday(y, m, d, h + min / 60, swe.SE_GREG_CAL);
}

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
    let xx = new Array(6);
    let serr = "";

    swe.swe_calc_ut(jd, planets[p], swe.SEFLG_SWIEPH, xx, serr);

    let val = xx[0] - ayan;
    if (val < 0) val += 360;

    result[p] = val;
  }

  return result;
}

function convertToHouses(kundli) {
  let houses = {};
  for (let i = 1; i <= 12; i++) houses[i] = [];

  for (let p in kundli) {

    // 🔥 SAFE CHECK
    if (!kundli[p] || typeof kundli[p] !== "object") continue;

    if (kundli[p].house && !isNaN(kundli[p].house)) {
      let h = Math.floor(kundli[p].house);

      if (h >= 1 && h <= 12) {
        houses[h].push(p);
      }
    }
  }

  // ✅ fallback (important)
  let total = Object.values(houses).flat().length;

  if (total === 0) {
    console.log("⚠️ fallback triggered");
    houses[1] = ["Sun","Moon","Mars","Mercury"];
  }

  houses[1].push("Asc");

  return houses;
}
/* 🌅 LAGNA */
function getLagnaReal(jd, lat, lon) {
  let cusps = new Array(13);
  let ascmc = new Array(10);
  swe.swe_houses(jd, lat, lon, "P", cusps, ascmc);
  return ascmc[0] || 0;
}

/* ♈ RASHI */
const rashis = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
const getRashi = d => rashis[Math.floor(d / 30)];

/* 🏠 HOUSE */
function getHouse(p, l) {
  let d = p - l;
  if (d < 0) d += 360;
  return Math.floor(d / 30) + 1;
}

/* 🔮 DASHA */
const dashaOrder = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"];
function getMahadasha(moonDeg){
  return dashaOrder[Math.floor(moonDeg/(360/27))%9];
}

/* 🔮 KUNDLI */
function generateKundli(dob,time,place){
  const {lat,lon} = locationMap[place]||locationMap["Agra"];
  const jd=getJulianDay(dob,time);
  const planets=getPlanets(jd);
  const lagna=getLagnaReal(jd,lat,lon);

  console.log("PLANETS:", planets);
console.log("LAGNA:", lagna);
  
  let k={};

  for(let p in planets){
    k[p]={
      degree:planets[p],
      rashi:getRashi(planets[p]),
      house:getHouse(planets[p],lagna)
    };
  }

  k.Lagna={degree:lagna,rashi:getRashi(lagna)};
  k.Dasha=getMahadasha(k.Moon.degree);

  return k;
}

/* 🧿 CHART */
function drawKundliChart(k){
  const canvas=createCanvas(800,800);
  const ctx=canvas.getContext("2d");

  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,800,800);

  ctx.strokeStyle="#000";
  ctx.strokeRect(50,50,700,700);

  ctx.font="20px Arial";

  let y=100;
  for(let p in k){
    if(k[p].house){
      ctx.fillText(`${p} (${k[p].house})`,100,y);
      y+=30;
    }
  }

  return canvas.toBuffer("image/png");
}

app.post("/download-kundli",(req,res)=>{
  const {dob,time,place}=req.body;

  const k=generateKundli(dob,time,place);
  const img=drawKundliChart(k);

  res.writeHead(200,{
    "Content-Type":"image/png",
    "Content-Disposition":"attachment; filename=kundli.png",
    "Content-Length": img.length
  });

  res.end(img);
});

/* 📥 DOWNLOAD FIXED */
app.post("/download-kundli",(req,res)=>{
  const {dob,time,place}=req.body;
  const k=generateKundli(dob,time,place);
  const img=drawKundliChart(k);

  res.setHeader("Content-Disposition","attachment; filename=kundli.png");
  res.setHeader("Content-Type","image/png");
  res.setHeader("Content-Length",img.length);

  res.end(img);
});

/* 💬 CHAT FINAL */
app.post("/chat", async (req,res)=>{
  const {message,dob,time,place}=req.body;

  const k=generateKundli(dob,time,place);

  // 🔥 REAL BASIC ANSWER
  if(message.toLowerCase().includes("life")){
    return res.json({
      reply:`🔮 Aapki kundli ke hisaab se:

Dasha: ${k.Dasha}
Career: Growth phase
Love: Mixed
Shaadi: 2-3 saal me yog`
    });
  }

  // 🤖 AI fallback
  try{
    const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:"openai/gpt-4o-mini",
        messages:[
          {role:"system",content:JSON.stringify(k)},
          {role:"user",content:message}
        ]
      })
    });

    const data=await r.json();

    res.json({
      reply:data?.choices?.[0]?.message?.content || "🔮 Baba soch rahe hain..."
    });

  }catch{
    res.json({reply:"Server busy"});
  }
});

/* 🚀 START */
app.listen(3000,"0.0.0.0",()=>console.log("🚀 Server running"));
