import fetch from "node-fetch";

const API_KEY = "AIzaSyBoQ9K8x01ZMhNuk23yjFPgp1E3CZy-7Ew";
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

const headers = {
  "Content-Type": "application/json"
};

const body = {
  contents: [{ parts: [{ text: "Hello Gemini!" }] }]
};

async function callGemini() {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });

  console.log("Status:", response.status);

  // Log all headers for analysis
  console.log("--- All headers ---");
  response.headers.forEach((v, k) => console.log(`${k}: ${v}`));
  console.log("-------------------");

  // Inspect standard quota-related headers
  console.log("X-RateLimit-Limit:", response.headers.get("x-ratelimit-limit"));
  console.log("X-RateLimit-Remaining:", response.headers.get("x-ratelimit-remaining"));
  console.log("X-RateLimit-Reset:", response.headers.get("x-ratelimit-reset"));
  console.log("X-RateLimit-Used:", response.headers.get("x-ratelimit-used"));

  const data = await response.json();
  console.log("Response:", JSON.stringify(data, null, 2));
}

callGemini();
