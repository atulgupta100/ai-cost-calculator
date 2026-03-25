const SYSTEM_PROMPT = `You are a cost estimation engine for enterprise AI projects. Analyze the project description and return a JSON object with all parameters needed to estimate monthly costs. Return ONLY valid JSON, no explanation, no markdown fences.

JSON schema (use null for unknown fields — do not omit fields):
{
  "users": <monthly active users, number>,
  "deploymentTier": <"api" | "managed" | "self">,
  "models": <array from: "haiku","sonnet","opus","gpt4o_mini","gpt4o","o3mini","o1","o3","gem15flash","gem20flash","gem15pro","gem25pro">,
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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured on server' });

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: description }]
      })
    });

    const data = await upstream.json();
    if (!upstream.ok) return res.status(upstream.status).json({ error: data?.error?.message || 'Upstream error' });

    const text = data.content?.[0]?.text || '';
    const jsonStr = text.replace(/```json|```/g, '').trim();
    const params = JSON.parse(jsonStr);

    res.status(200).json(params);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
