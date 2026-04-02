const express = require("express");
const cors = require("cors");
const { createCanvas } = require("canvas");
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));
const swe = require("swisseph");

swe.swe_set_ephe_path(process.cwd());
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
    let serr = "";

    // ✅ CORRECT CALL
    swe.swe_calc_ut(jd, planets[p], swe.SEFLG_SWIEPH, xx, serr);

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

  let asc = ascmc[0];

  if (!asc || isNaN(asc)) {
    console.log("❌ Lagna error");
    return 0;
  }

  return asc;
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

/* 🌐 TRANSIT */
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

/* 🔥 SYMBOLS */
const short = {
  Sun: "Su ☉",
  Moon: "Mo ☽",
  Mars: "Ma ♂",
  Mercury: "Me ☿",
  Jupiter: "Ju ♃",
  Venus: "Ve ♀",
  Saturn: "Sa ♄"
};

function convertToHouses(kundli) {
  let houses = {};
  for (let i = 1; i <= 12; i++) houses[i] = [];

  for (let p in kundli) {
    if (kundli[p] && kundli[p].house && !isNaN(kundli[p].house)) {
      let h = Math.floor(kundli[p].house);
      if (h >= 1 && h <= 12) {
        houses[h].push(p);
      }
    }
  }

  // fallback (agar sab empty ho gaya)
  let total = Object.values(houses).flat().length;

  if (total === 0) {
    console.log("⚠️ fallback triggered");
    houses[1] = ["Sun","Moon","Mars","Mercury"];
  }

  houses[1].push("Asc");

  return houses;
}
function drawKundliChart(kundli) {
  const canvas = createCanvas(900, 900);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 900, 900);

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;

  // Outer diamond
  ctx.beginPath();
  ctx.moveTo(450, 50);
  ctx.lineTo(850, 450);
  ctx.lineTo(450, 850);
  ctx.lineTo(50, 450);
  ctx.closePath();
  ctx.stroke();

  // Cross
  ctx.beginPath();
  ctx.moveTo(450, 50); ctx.lineTo(450, 850);
  ctx.moveTo(50, 450); ctx.lineTo(850, 450);
  ctx.stroke();

  // Diagonal
  ctx.beginPath();
  ctx.moveTo(250, 250); ctx.lineTo(650, 650);
  ctx.moveTo(650, 250); ctx.lineTo(250, 650);
  ctx.stroke();

  const houses = convertToHouses(kundli);

  // Rashi numbers (real pandit style)
  const rashiNumbers = {
    1:"1",2:"2",3:"3",4:"4",
    5:"5",6:"6",7:"7",8:"8",
    9:"9",10:"10",11:"11",12:"12"
  };

  const pos = {
    1:[450,160],2:[700,300],3:[780,450],4:[700,700],
    5:[450,820],6:[200,700],7:[120,450],8:[200,300],
    9:[450,300],10:[600,450],11:[450,600],12:[300,450]
  };

  ctx.textAlign = "center";

  // Draw house numbers (important 🔥)
  ctx.font = "16px Arial";
  for (let h in pos) {
    const [x,y] = pos[h];
    ctx.fillText(rashiNumbers[h], x, y - 25);
  }

  // Draw planets (clean spacing)
  ctx.font = "18px Arial";

  for (let h in houses) {
    const [x,y] = pos[h];

    houses[h].forEach((p, i) => {
      ctx.fillText(p, x, y + (i * 18));
    });
  }

  // Title
  ctx.font = "26px Arial";
  ctx.fillText("Vedic Kundli", 450, 40);

  return canvas.toBuffer("image/png");
}
/* 🎯 TIMING */
function getTiming(k,cat){
  let base={LOVE:2,CAREER:4,MONEY:1,GENERAL:3};
  let add=base[cat]||3;

  if(k.Dasha==="Saturn") add+=2;
  if(k.Dasha==="Venus") add-=1;

  let now=new Date();
  let m=now.getMonth()+1+add;
  let y=now.getFullYear();

  if(m>12){m-=12;y++;}

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

/* 📊 CHART API */
app.post("/kundli-chart",(req,res)=>{
  const {dob,time,place}=req.body;
  const k=generateKundli(dob,time,place);
  const img=drawKundliChart(k);
  res.setHeader("Content-Type","image/png");
  res.send(img);
});

/* 📥 DOWNLOAD */
app.post("/download-kundli",(req,res)=>{
  const {dob,time,place}=req.body;
  const k=generateKundli(dob,time,place);
  const img=drawKundliChart(k);

  res.setHeader("Content-Disposition","attachment; filename=kundli.png");
  res.setHeader("Content-Type","image/png");
  res.send(img);
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
            content: `
Tum ek professional Vedic astrologer ho.

RULES:
- Kabhi bhi AI ya model hone ki baat mat karo
- Kabhi "data limitation", "2023", "training data" mention mat karo
- Sirf jyotish ke basis par jawab do
- Future prediction confidently do
- Hinglish me baat karo
- Emotional aur human tone rakho
- Direct answer do, avoid refusal

KUNDLI DATA:
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
