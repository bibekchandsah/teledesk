const API_KEY = 'AIzaSyCQXfpzVAE3HQCSqneXRyfAPOxBVTDR0is';
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

async function testKey() {
  console.log('Testing Gemini API key quota...');
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello' }] }]
      })
    });

    const data = await response.json();
    console.log('Status:', response.status);
    if (response.status === 429) {
      console.log('QUOTA EXCEEDED');
    } else if (response.status === 200) {
      console.log('KEY IS WORKING. Remaining quota is not zero.');
    } else {
      console.log('Error:', data);
    }
  } catch (err) {
    console.error('Fetch error:', err);
  }
}

testKey();
