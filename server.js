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
    let xx = new Array(6);
    swe.swe_calc_ut(jd, planets[p], swe.SEFLG_SWIEPH, xx);

    let val = xx[0] - ayan;
    if (val < 0) val += 360;

    result[p] = val;
  }

  return result;
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

/* 🌙 NAKSHATRA */
const nakshatras = ["Ashwini","Bharani","Krittika","Rohini","Mrigashira","Ardra","Punarvasu","Pushya","Ashlesha","Magha","Purva Phalguni","Uttara Phalguni","Hasta","Chitra","Swati","Vishakha","Anuradha","Jyeshtha","Mula","Purva Ashadha","Uttara Ashadha","Shravana","Dhanishta","Shatabhisha","Purva Bhadrapada","Uttara Bhadrapada","Revati"];

function getNakshatraDetails(deg) {
  const i = Math.floor(deg / (360/27));
  return nakshatras[i];
}

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

  let k={};

  for(let p in planets){
    k[p]={
      degree:planets[p],
      rashi:getRashi(planets[p]),
      house:getHouse(planets[p],lagna),
      nakshatra:getNakshatraDetails(planets[p])
    };
  }

  k.Lagna={degree:lagna,rashi:getRashi(lagna)};
  k.Dasha=getMahadasha(k.Moon.degree);

  return k;
}

/* 🔥 SYMBOLS */
const short = {
  Sun:"Su",Moon:"Mo",Mars:"Ma",
  Mercury:"Me",Jupiter:"Ju",
  Venus:"Ve",Saturn:"Sa"
};

/* 🧿 CHART FIX */
function convertToHouses(kundli){
  let h={}; for(let i=1;i<=12;i++) h[i]=[];

  for(let p in kundli){
    if(kundli[p]?.house){
      h[kundli[p].house].push(short[p]||p);
    }
  }

  if(Object.values(h).flat().length===0){
    h[1]=["Su","Mo","Ma"];
  }

  h[1].push("Asc");
  return h;
}

/* 🧿 DRAW */
function drawKundliChart(k){
  const canvas=createCanvas(800,800);
  const ctx=canvas.getContext("2d");

  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,800,800);

  ctx.strokeRect(100,100,600,600);

  const houses=convertToHouses(k);

  ctx.font="16px Arial";

  for(let i=1;i<=12;i++){
    ctx.fillText(houses[i].join(","),100+(i*40),400);
  }

  return canvas.toBuffer();
}

/* 🔮 FULL ASTRO */
function fullAstro(k){
  let y=new Date().getFullYear();

  return `
Past: struggle + learning

Present: ${k.Dasha}

Future:
Shaadi: ${y+2}
Career: Growth
Love: Mixed
Money: Stable
`;
}

/* 💬 CHAT */
app.post("/chat", async (req,res)=>{
  const {message,dob,time,place}=req.body;
  const k=generateKundli(dob,time,place);

  if(message.toLowerCase().includes("life")){
    return res.json({reply:fullAstro(k)});
  }

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
    res.json({reply:data.choices[0].message.content});

  }catch{
    res.json({reply:"error"});
  }
});

/* 📊 CHART */
app.post("/kundli-chart",(req,res)=>{
  const k=generateKundli(req.body.dob,req.body.time,req.body.place);
  res.setHeader("Content-Type","image/png");
  res.send(drawKundliChart(k));
});

/* 🚀 START */
app.listen(3000,()=>console.log("🚀 Running"));

