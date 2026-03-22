import { config } from "dotenv";
config();

async function testGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("No GEMINI_API_KEY in .env");
    return;
  }
  
  console.log("Testing API key starting with:", apiKey.slice(0, 8) + "...");
  
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: "Hello" }] }]
    })
  });
  
  if (!res.ok) {
    const err = await res.text();
    console.error(`Error ${res.status}:`, err);
  } else {
    console.log("Success! API key works.");
  }
}

testGemini();
