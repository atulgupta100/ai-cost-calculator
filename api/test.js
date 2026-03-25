export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ ok: false, error: 'GEMINI_API_KEY env var is not set' });

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: 'Reply with the word WORKING in caps.' }] }],
          generationConfig: { maxOutputTokens: 10, temperature: 0 }
        })
      }
    );
    const data = await upstream.json();
    if (!upstream.ok) return res.status(200).json({ ok: false, status: upstream.status, error: data?.error?.message, full: data });
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    res.status(200).json({ ok: true, response: text, keyPrefix: apiKey.slice(0, 8) + '…' });
  } catch (e) {
    res.status(200).json({ ok: false, error: e.message });
  }
}
