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

  const ayan = swe.swe_get_ayanamsa(jd);
  let result = {};

  for (let p in planets) {
    const res = swe.swe_calc_ut(jd, planets[p]);
    let val = res.longitude - ayan;
    if (val < 0) val += 360;
    result[p] = val;
  }

  return result;
}

/* 🌅 LAGNA */
function getLagnaReal(jd, lat, lon) {
  return swe.swe_houses(jd, lat, lon, "P").ascendant;
}

/* ♈ RASHI */
const rashis = ["Aries","Taurus","Gemini","Cancer","Leo","Virgo","Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"];
const getRashi = d => rashis[Math.floor(d / 30)];

/* 🌙 NAKSHATRA */
const nakshatras = [
"Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya",
"Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati",
"Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana",
"Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"
];

function getNakshatraDetails(deg) {
  const i = Math.floor(deg / (360/27));
  const p = Math.floor((deg % (360/27)) / (360/108)) + 1;
  return { nakshatra: nakshatras[i], pada: p };
}

/* 🏠 HOUSE */
function getHouse(p, l) {
  let d = p - l;
  if (d < 0) d += 360;
  return Math.floor(d / 30) + 1;
}

/* 🔮 NAVAMSA */
function getNavamsa(deg) {
  const s = Math.floor(deg / 30);
  const n = Math.floor((deg % 30) / (30/9));
  return rashis[(s*9+n)%12];
}

/* 🔮 DASHA */
const dashaOrder = ["Ketu","Venus","Sun","Moon","Mars","Rahu","Jupiter","Saturn","Mercury"];

function getMahadasha(moonDeg){
  const i = Math.floor(moonDeg/(360/27))%9;
  return dashaOrder[i];
}

/* 🌐 TRANSIT (GOCHAR) */
function getTransit() {
  const now = new Date();
  const jd = swe.swe_julday(
    now.getFullYear(),
    now.getMonth()+1,
    now.getDate(),
    now.getHours(),
    swe.SE_GREG_CAL
  );

  return getPlanets(jd);
}

/* 🔮 KUNDLI */
function generateKundli(dob,time,place){
  const {lat,lon} = locationMap[place]||locationMap["Agra"];
  const jd=getJulianDay(dob,time);
  const planets=getPlanets(jd);
  const lagna=getLagnaReal(jd,lat,lon);

  let k={};

  for(let p in planets){
    const nak=getNakshatraDetails(planets[p]);

    k[p]={
      degree:planets[p],
      rashi:getRashi(planets[p]),
      house:getHouse(planets[p],lagna),
      nakshatra:nak.nakshatra,
      pada:nak.pada,
      navamsa:getNavamsa(planets[p])
    };
  }

  k.Lagna={degree:lagna,rashi:getRashi(lagna)};
  k.Dasha=getMahadasha(k.Moon.degree);
  k.Transit=getTransit();

  return k;
}

function drawKundliChart(kundli) {
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext("2d");

  // background
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, 800, 800);

  ctx.strokeStyle = "black";
  ctx.lineWidth = 2;

  // diamond shape
  ctx.beginPath();
  ctx.moveTo(400, 50);
  ctx.lineTo(750, 400);
  ctx.lineTo(400, 750);
  ctx.lineTo(50, 400);
  ctx.closePath();
  ctx.stroke();

  // cross lines
  ctx.beginPath();
  ctx.moveTo(400, 50);
  ctx.lineTo(400, 750);
  ctx.moveTo(50, 400);
  ctx.lineTo(750, 400);
  ctx.stroke();

  // planets text
  ctx.font = "18px Arial";
  ctx.fillStyle = "black";

  let y = 100;

  for (let p in kundli) {
    if (kundli[p].rashi) {
      ctx.fillText(`${p}: ${kundli[p].rashi}`, 100, y);
      y += 25;
    }
  }

  return canvas.toBuffer();
}

/* 🎯 SMART TIMING */
function getTiming(k,cat){
  let baseMonths = {
    LOVE: 2,
    CAREER: 3,
    MONEY: 1,
    GENERAL: 4
  };

  let add = baseMonths[cat] || 3;

  if(k.Dasha==="Venus") add -= 1;
  if(k.Dasha==="Saturn") add += 2;

  let now=new Date();
  let m=now.getMonth()+1+add;
  let y=now.getFullYear();

  if(m>12){ m-=12; y+=1; }

  return `${m}/${y}`;
}

/* 🔥 CATEGORY */
function detectCategory(msg){
  msg=msg.toLowerCase();
  if(msg.includes("love")) return "LOVE";
  if(msg.includes("career")) return "CAREER";
  if(msg.includes("money")) return "MONEY";
  return "GENERAL";
}

/* 🔥 FALLBACK */
function fallback(k,cat,time){
  return `Aapki ${k.Dasha} dasha chal rahi hai. ${cat} me strong improvement ${time} ke aas paas dikhega.`;
}

app.post("/kundli-chart", (req, res) => {
  const { dob, time, place } = req.body;

  const kundli = generateKundli(dob, time, place);

  const image = drawKundliChart(kundli);

  res.setHeader("Content-Type", "image/png");
  res.send(image);
});

app.post("/download-kundli", (req, res) => {
  const { dob, time, place } = req.body;

  const kundli = generateKundli(dob, time, place);
  const image = drawKundliChart(kundli);

  res.setHeader("Content-Disposition", "attachment; filename=kundli.png");
  res.setHeader("Content-Type", "image/png");

  res.send(image);
});
/* 💬 CHAT */
app.post("/chat", async (req,res)=>{
  const {message,dob,time,place}=req.body;

  const k=generateKundli(dob,time,place);
  const cat=detectCategory(message);
  const timing=getTiming(k,cat);

  try{
    const r=await fetch("https://openrouter.ai/api/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type":"application/json"
      },
      body:JSON.stringify({
        model:"openai/gpt-4o-mini",
        temperature:0.5,
        messages:[
          {
            role:"system",
            content:`
Tum ek expert jyotish ho.

RULES:
- Exact month/year bolo (${timing})
- Hinglish
- Short & confident
- Future only

KUNDLI:
${JSON.stringify(k)}
`
          },
          {role:"user",content:message}
        ]
      })
    });

    const data=await r.json();

    let reply=data?.choices?.[0]?.message?.content || fallback(k,cat,timing);

    res.json({reply,kundli:k,timing});

  }catch(e){
    res.json({reply:fallback(k,cat,timing),kundli:k,timing});
  }
});

/* ❤️ MATCH */
app.post("/match",(req,res)=>{
  const {p1,p2}=req.body;

  const k1=generateKundli(p1.dob,p1.time,p1.place);
  const k2=generateKundli(p2.dob,p2.time,p2.place);

  let score=0;
  if(k1.Moon.rashi===k2.Moon.rashi) score+=7;
  if(k1.Moon.nakshatra===k2.Moon.nakshatra) score+=8;

  res.json({
    score:`${score}/36`,
    verdict: score>15 ? "Good Match 💖" : "Average ⚠"
  });
});

/* 🚀 START */
app.listen(process.env.PORT||3000,"0.0.0.0",()=>console.log("Server running 🚀"));
