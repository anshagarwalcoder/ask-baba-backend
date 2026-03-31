const express = require("express");
const cors = require("cors");
const fetch = (...args) =>
import("node-fetch").then(({ default: 
fetch }) => fetch(...args));

const PDFDocument = require("pdfkit");
const multer = require("multer");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Server is running 🚀");
});

const upload = multer({ dest: "uploads/" });

/* 🌞 SUN SIGN */
function getSunSign(day, month) {
  if ((month == 8 && day >= 23) || (month == 9 && day <= 22)) return "Virgo";
  if ((month == 9 && day >= 23) || (month == 10 && day <= 22)) return "Libra";
  if ((month == 10 && day >= 23) || (month == 11 && day <= 21)) return "Scorpio";
  if ((month == 11 && day >= 22) || (month == 12 && day <= 21)) return "Sagittarius";
  if ((month == 12 && day >= 22) || (month == 1 && day <= 19)) return "Capricorn";
  if ((month == 1 && day >= 20) || (month == 2 && day <= 18)) return "Aquarius";
  if ((month == 2 && day >= 19) || (month == 3 && day <= 20)) return "Pisces";
  if ((month == 3 && day >= 21) || (month == 4 && day <= 19)) return "Aries";
  if ((month == 4 && day >= 20) || (month == 5 && day <= 20)) return "Taurus";
  if ((month == 5 && day >= 21) || (month == 6 && day <= 20)) return "Gemini";
  if ((month == 6 && day >= 21) || (month == 7 && day <= 22)) return "Cancer";
  if ((month == 7 && day >= 23) || (month == 8 && day <= 22)) return "Leo";
}

/* 🔥 SIMPLE LAGNA */
function getLagna(hour) {
  const signs = [
    "Aries","Taurus","Gemini","Cancer","Leo","Virgo",
    "Libra","Scorpio","Sagittarius","Capricorn","Aquarius","Pisces"
  ];
  return signs[Math.floor(hour / 2) % 12];
}

/* 💬 CHAT API */
app.post("/chat", async (req, res) => {
  const { message, name, dob, time, place } = req.body;

  const [day, month, year] = dob.split("/");
  const hour = parseInt(time.split(":")[0]);

  const sunSign = getSunSign(parseInt(day), parseInt(month));
  const lagna = getLagna(hour);

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-3.5-turbo-0125",
        messages: [
          {
            role: "system",
content: `
You are a highly accurate Indian astrologer.

STRICT RULES:
- Only answer what user asked
- No extra explanation
- No motivational or generic lines
- No unnecessary advice
- Keep answers short, direct and specific
- If user asks for kundli → give kundli details only
- If user asks question → answer only that question
- Use Hinglish (simple Hindi tone)
- Sound confident like real pandit

User Details:
Name: ${name}
DOB: ${dob}
Time: ${time}
Place: ${place}
Sun Sign: ${sunSign}
Lagna: ${lagna}

IMPORTANT:
- Do not say "mehnat karo", "sab theek hoga"
- Do not add extra lines
- Do not repeat
- Only exact answer
`
          },
          { role: "user", content: message }
        ]
      })
    });

    if (!response.ok) throw new Error("API error");

    const data = await response.json();
    console.log(data);

    let reply = "🔮 Baba dhyaan laga rahe hain...";

    if (data?.choices?.length > 0) {
      reply = data.choices[0].message.content;
    }

    res.json({ reply, sunSign, lagna });

  } catch (err) {
    console.log(err);

    res.json({
      reply: "🔮 Baba keh rahe hain... thoda samay baad phir poochiye."
    });
  }
});

/* 📄 KUNDLI PDF */
app.post("/kundli", (req, res) => {
  const { name, dob, place } = req.body;

  const doc = new PDFDocument();
  const filePath = `kundli_${Date.now()}.pdf`;

  doc.pipe(fs.createWriteStream(filePath));

  doc.fontSize(22).text("🔮 Kundli Report", { align: "center" });
  doc.moveDown();

  doc.fontSize(14).text(`Name: ${name}`);
  doc.text(`DOB: ${dob}`);
  doc.text(`Place: ${place}`);
  doc.moveDown();

  doc.text("Analysis:");
  doc.text("Aapka swabhav strong hai.");
  doc.text("Aap life me kuch bada karoge.");
  doc.text("Kabhi kabhi confusion aata hai lekin destiny strong hai.");

  doc.end();

  setTimeout(() => {
    res.download(filePath);
  }, 1000);
});

/* 📤 IMAGE UPLOAD */
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ message: "Kundli uploaded ✅" });
});

app.listen(3000, "0.0.0.0", () => {
  console.log("Server running 🚀");
});
