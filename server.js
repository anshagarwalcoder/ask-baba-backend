import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { createCanvas } from "canvas";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;

// ================== BASIC FAKE SAFE KUNDLI ==================
// (jab Swiss Ephemeris fail ho tab bhi app crash na ho)

function generateKundli(dob, time, place) {
  return {
    Sun: { rashi: "Leo", house: 1 },
    Moon: { rashi: "Cancer", house: 12 },
    Mars: { rashi: "Aries", house: 9 },
    Mercury: { rashi: "Virgo", house: 2 },
    Jupiter: { rashi: "Sagittarius", house: 5 },
    Venus: { rashi: "Libra", house: 3 },
    Saturn: { rashi: "Aquarius", house: 7 },
    Lagna: 1
  };
}

// ================== DRAW KUNDLI ==================

function drawKundliChart(kundli) {
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 800, 800);

  ctx.strokeStyle = "#000";
  ctx.lineWidth = 2;

  // outer box
  ctx.strokeRect(50, 50, 700, 700);

  ctx.font = "20px Arial";

  let y = 100;

  for (let p in kundli) {
    if (p === "Lagna") continue;

    const data = kundli[p];

    ctx.fillText(
      `${p}: ${data.rashi} (H${data.house})`,
      80,
      y
    );

    y += 40;
  }

  return canvas.toBuffer("image/png");
}

// ================== OPENROUTER AI ==================

async function getAIResponse(prompt) {
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
          content:
            "You are a professional Vedic astrologer. Give logical and real answers only."
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
}

// ================== FORMAT ==================

function formatKundliForAI(k) {
  let text = "Kundli Data:\n";

  for (let p in k) {
    if (p === "Lagna") continue;

    text += `${p} in ${k[p].rashi}, House ${k[p].house}\n`;
  }

  return text;
}

// ================== ROUTES ==================

// 👉 Download Kundli Image
app.post("/download-kundli", (req, res) => {
  try {
    const { dob, time, place } = req.body;

    const kundli = generateKundli(dob, time, place);

    const img = drawKundliChart(kundli);

    res.set({
      "Content-Type": "image/png",
      "Content-Disposition": "attachment; filename=kundli.png"
    });

    res.send(img);
  } catch (e) {
    console.log(e);
    res.status(500).send("Download failed");
  }
});

// 👉 AI Answer
app.post("/ask-ai", async (req, res) => {
  try {
    const { dob, time, place, question } = req.body;

    const kundli = generateKundli(dob, time, place);

    const kundliText = formatKundliForAI(kundli);

    const prompt = `
${kundliText}

User Question: ${question}

Give accurate astrology answer.
`;

    const answer = await getAIResponse(prompt);

    res.json({ answer });
  } catch (e) {
    console.log(e);
    res.status(500).send("AI error");
  }
});

// ================== START ==================

app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});