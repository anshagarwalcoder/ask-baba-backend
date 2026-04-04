import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { createCanvas } from "canvas";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// ================= ROOT =================
app.get("/", (req, res) => {
  res.send("🔥 Ask Baba Backend Running");
});

// ================= LOCATION MAP =================
function getCoords(place) {
  const map = {
    "Agra": { lat: 27.1767, lon: 78.0081 },
    "Delhi": { lat: 28.6139, lon: 77.2090 }
  };

  return map[place] || map["Agra"];
}

// ================= REAL ASTRO API =================
async function getKundli(dob, time, place) {
  const { lat, lon } = getCoords(place);

  const res = await fetch("https://api.vedicastroapi.com/v3-json/horoscope/basic", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.ASTRO_API_KEY}`
    },
    body: JSON.stringify({
      dob: dob,
      tob: time,
      lat: lat,
      lon: lon,
      tz: 5.5
    })
  });

  const data = await res.json();

  console.log("ASTRO DATA:", data);

  return data;
}

// ================= DRAW IMAGE =================
function drawKundliChart(data) {
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 800, 800);

  ctx.fillStyle = "#000";
  ctx.font = "22px Arial";

  let y = 100;

  if (!data || !data.planets) {
    ctx.fillText("No Kundli Data Found", 100, 100);
    return canvas.toBuffer("image/png");
  }

  data.planets.forEach((p) => {
    ctx.fillText(`${p.name}: ${p.sign}`, 80, y);
    y += 40;
  });

  return canvas.toBuffer("image/png");
}

// ================= OPENROUTER AI =================
async function getAIResponse(prompt) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content: "You are a professional Vedic astrologer. Give real and logical answers only."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await res.json();
    return data?.choices?.[0]?.message?.content || "No response";

  } catch (e) {
    console.log("AI ERROR:", e);
    return "AI failed";
  }
}

// ================= DOWNLOAD API =================
app.post("/download-kundli", async (req, res) => {
  try {
    const { dob, time, place } = req.body;

    const data = await getKundli(dob, time, place);

    const img = drawKundliChart(data);

    res.set({
      "Content-Type": "image/png",
      "Content-Disposition": "attachment; filename=kundli.png"
    });

    res.send(img);

  } catch (e) {
    console.log("DOWNLOAD ERROR:", e);
    res.status(500).send("Download failed");
  }
});

// ================= AI API =================
app.post("/ask-ai", async (req, res) => {
  try {
    const { dob, time, place, question } = req.body;

    const data = await getKundli(dob, time, place);

    const prompt = `
Kundli Data:
${JSON.stringify(data)}

Question: ${question}
`;

    const answer = await getAIResponse(prompt);

    res.json({ answer });

  } catch (e) {
    console.log("AI ERROR:", e);
    res.status(500).send("AI error");
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log("🚀 Server running on port", PORT);
});