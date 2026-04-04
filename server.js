import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import { createCanvas } from "canvas";

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 10000;

// ================= ROOT FIX (Cannot GET fix) =================
app.get("/", (req, res) => {
  res.send("🚀 Ask Baba Backend Running Successfully");
});

// ================= SAFE KUNDLI =================
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

// ================= DRAW IMAGE =================
function drawKundliChart(kundli) {
  const canvas = createCanvas(800, 800);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 800, 800);

  ctx.strokeStyle = "#000";
  ctx.strokeRect(50, 50, 700, 700);

  ctx.font = "20px Arial";

  let y = 100;

  for (let p in kundli) {
    if (p === "Lagna") continue;

    const d = kundli[p];

    ctx.fillText(`${p}: ${d.rashi} (H${d.house})`, 80, y);
    y += 40;
  }

  return canvas.toBuffer("image/png");
}

// ================= OPENROUTER =================
async function getAIResponse(prompt) {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "mistralai/mistral-7b-instruct",
        messages: [
          {
            role: "system",
            content:
              "You are a Vedic astrologer. Give logical, real answers. Do not guess."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const data = await res.json();

    return data?.choices?.[0]?.message?.content || "No AI response";
  } catch (e) {
    console.log("AI ERROR:", e);
    return "AI failed";
  }
}

// ================= FORMAT =================
function formatKundli(k) {
  let text = "";

  for (let p in k) {
    if (p === "Lagna") continue;
    text += `${p} in ${k[p].rashi}, House ${k[p].house}\n`;
  }

  return text;
}

// ================= DOWNLOAD API =================
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
    console.log("DOWNLOAD ERROR:", e);
    res.status(500).send("Download failed");
  }
});

// ================= AI API =================
app.post("/ask-ai", async (req, res) => {
  try {
    const { dob, time, place, question } = req.body;

    const kundli = generateKundli(dob, time, place);

    const prompt = `
Kundli:
${formatKundli(kundli)}

Question: ${question}
`;

    const answer = await getAIResponse(prompt);

    res.json({ answer });
  } catch (e) {
    console.log("AI ROUTE ERROR:", e);
    res.status(500).send("AI error");
  }
});

// ================= START =================
app.listen(PORT, () => {
  console.log("🔥 Server running on port", PORT);
});