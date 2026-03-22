import { env } from '../src/lib/config/env';

async function testGemini() {
  const apiKey = 'AIzaSyACl2XjSOuO8tnCdKnYscDKHANLua-GYAE'; // Using the key directly to avoid any env loading issues
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`;

  const body = {
    contents: [{ parts: [{ text: "Hello, confirm you are working." }] }]
  };

  console.log(`Testing key: ${apiKey.slice(0, 10)}...`);
  
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("Gemini API Error:", JSON.stringify(data, null, 2));
    } else {
      console.log("Gemini API Success:", JSON.stringify(data, null, 2));
    }
  } catch (error) {
    console.error("Fetch Error:", error);
  }
}

testGemini();
