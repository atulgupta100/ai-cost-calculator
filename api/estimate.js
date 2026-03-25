const SYSTEM_PROMPT = `You are a cost estimation engine for enterprise AI projects. Analyze the project description and return a JSON object with all parameters needed to estimate monthly costs. Return ONLY valid JSON, no explanation, no markdown fences.

JSON schema (use null for unknown fields — do not omit fields):
{
  "users": <monthly active users, number>,
  "deploymentTier": <"api" | "managed" | "self">,
  "models": <array from: "haiku","sonnet","opus","gpt4o_mini","gpt4o","o3mini","o1","o3","gem15flash","gem20flash","gem15pro","gem25pro","llama33_70b","llama4_scout","llama4_maverick","ds_v3","ds_r1">,
  "inputTokensM": <total monthly INPUT tokens in MILLIONS, number>,
  "outputTokensM": <total monthly OUTPUT tokens in MILLIONS, number>,
  "features": {
    "vectordb": <boolean>,
    "rag": <boolean>,
    "llmops": <boolean>,
    "guardrails": <boolean>,
    "agents": <boolean>,
    "sso": <boolean>
  },
  "compliance": <array of applicable cost strings: "500"=SOC2, "800"=HIPAA, "1200"=GDPR, "2000"=FedRAMP, "600"=ISO27001>,
  "team": {
    "engineers": <number>,
    "salary": <annual USD, number>,
    "timePct": <0-100, number>,
    "supportTier": <0|500|3000|10000>
  },
  "infra": {
    "vcpus": <number>,
    "ramGB": <number>,
    "storageTB": <number>,
    "egressTB": <number>
  },
  "reasoning": "<show your token math step by step in 2-3 sentences>"
}

Token calculation rules:
- Conversational/chat: 25,000 input + 4,000 output tokens per conversation-hour (~15 turns/hr)
- Document processing: 2,000 input + 300 output tokens per document
- API/discrete requests: 800 input + 200 output tokens per request
- Code generation: 600 input + 400 output per request
- Always multiply by 30 for daily volumes, 4.33 for weekly volumes to get monthly total
- inputTokensM and outputTokensM must reflect the TOTAL monthly volume across all users`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { description } = req.body || {};
  if (!description?.trim()) return res.status(400).json({ error: 'description is required' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: description }] }],
          generationConfig: {
            maxOutputTokens: 1024,
            temperature: 0.1,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const data = await upstream.json();

    if (!upstream.ok) {
      const msg = data?.error?.message || JSON.stringify(data);
      return res.status(upstream.status).json({ error: `Gemini error: ${msg}` });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    if (!text) return res.status(500).json({ error: 'Gemini returned an empty response' });

    // Strip any markdown fences just in case, then find the JSON object
    const stripped = text.replace(/```json|```/g, '').trim();
    const match = stripped.match(/\{[\s\S]*\}/);
    if (!match) return res.status(500).json({ error: 'No JSON object found in Gemini response', raw: text.slice(0, 300) });

    const params = JSON.parse(match[0]);
    res.status(200).json(params);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
