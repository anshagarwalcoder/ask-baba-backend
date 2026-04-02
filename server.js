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
    const res = swe.swe_calc_ut(jd, planets[p], swe.SEFLG_SWIEPH);
    let val = res.longitude - ayan;
    if (val < 0) val += 360;

    result[p] = val;
  }

  return result;
}

/* 🌅 LAGNA */
function getLagnaReal(jd, lat, lon) {
  try {
    const h = swe.swe_houses(jd, lat, lon, "P");
    return h?.ascendant || 0;
  } catch {
    return 0;
  }
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
      house:getHouse(planets[p],lagna)
    };
  }

  k.Lagna={degree:lagna,rashi:getRashi(lagna)};
  return k;
}

/* 🔮 LOGIC PREDICTIONS */

function marriage(k){
  let y=new Date().getFullYear();

  if(k.Venus.house===7) return `💍 Shaadi ka strong yog ${y+1}`;
  if(k.Jupiter.house===7) return `💍 ${y+2} tak shaadi pakki`;
  if(k.Saturn.house===7) return `💍 Delay hai, ${y+3}`;

  return `💍 ${y+2}-${y+4} ke beech shaadi`;
}

function career(k){
  if(k.Saturn.house===10) return "💼 Strong stable career";
  if(k.Mars.house===10) return "💼 Action career success";
  return "💼 Growth aa rahi hai";
}

function love(k){
  if(k.Venus.house===5) return "❤️ True love success";
  if(k.Saturn.house===5) return "❤️ Delay in love";
  return "❤️ Mixed love life";
}

function money(k){
  if(k.Jupiter.house===2) return "💰 Strong wealth";
  if(k.Saturn.house===2) return "💰 Slow income growth";
  return "💰 Normal finance";
}

/* 📊 CHART */
function convertToHouses(kundli) {
  let houses = {};
  for (let i = 1; i <= 12; i++) houses[i] = [];

  for (let p in kundli) {
    if (kundli[p]?.house) {
      houses[kundli[p].house].push(p);
    }
  }

  houses[1].push("Asc");
  return houses;
}

function drawChart(k){
  const canvas=createCanvas(900,900);
  const ctx=canvas.getContext("2d");

  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,900,900);

  ctx.strokeStyle="#000";
  ctx.lineWidth=3;

  ctx.beginPath();
  ctx.moveTo(450,50);
  ctx.lineTo(850,450);
  ctx.lineTo(450,850);
  ctx.lineTo(50,450);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(450,50); ctx.lineTo(450,850);
  ctx.moveTo(50,450); ctx.lineTo(850,450);
  ctx.stroke();

  const houses = convertToHouses(k);

  ctx.font="18px Arial";
  ctx.textAlign="center";

  const pos={
    1:[450,150],2:[700,300],3:[780,450],4:[700,700],
    5:[450,820],6:[200,700],7:[120,450],8:[200,300],
    9:[450,300],10:[600,450],11:[450,600],12:[300,450]
  };

  for(let h in houses){
    const [x,y]=pos[h];
    houses[h].forEach((p,i)=>{
      ctx.fillText(p,x,y+(i*18));
    });
  }

  ctx.font="26px Arial";
  ctx.fillText("Vedic Kundli",450,40);

  return canvas.toBuffer("image/png");
}

/* 💬 CHAT + AI + LOGIC */
app.post("/chat", async (req,res)=>{
  const {message,dob,time,place}=req.body;

  const k=generateKundli(dob,time,place);
  let msg=message.toLowerCase();

  // 🔥 RULE BASED (REAL)
  if(msg.includes("shaadi")) return res.json({reply: marriage(k)});
  if(msg.includes("career")) return res.json({reply: career(k)});
  if(msg.includes("love")) return res.json({reply: love(k)});
  if(msg.includes("money")) return res.json({reply: money(k)});

  // 🤖 AI fallback (OpenRouter)
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
          {role:"system",content:`Tum ek jyotish ho. Kundli data: ${JSON.stringify(k)}`},
          {role:"user",content:message}
        ]
      })
    });

    const data=await r.json();
    const reply=data?.choices?.[0]?.message?.content;

    res.json({reply: reply || "🔮 Baba soch rahe hain..."});

  }catch{
    res.json({reply:"🔮 System busy hai"});
  }
});

/* 📥 DOWNLOAD */
app.post("/download-kundli",(req,res)=>{
  const {dob,time,place}=req.body;

  const k=generateKundli(dob,time,place);
  const img=drawChart(k);

  res.setHeader("Content-Disposition","attachment; filename=kundli.png");
  res.setHeader("Content-Type","image/png");
  res.send(img);
});

/* 🚀 START */
app.listen(process.env.PORT||3000,"0.0.0.0",()=>{
  console.log("🔥 ALL-IN-ONE ASTRO SERVER RUNNING");
});