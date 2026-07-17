// Vercel Serverless Function — trip planning assistant with web search.
// Receives the user's message + a compact snapshot of the current project, and can
// look things up online (flight prices, opening hours, requirements) via Claude's
// web_search tool. Set env var ANTHROPIC_API_KEY.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'Missing ANTHROPIC_API_KEY env var on the server.' });
    return;
  }

  try {
    const { message, projectSummary, history } = req.body || {};
    if (!message) {
      res.status(400).json({ error: 'No message.' });
      return;
    }

    const system = [
      'You are a sharp, concise personal travel-planning assistant embedded in a Hebrew budget-builder app.',
      'Answer in Hebrew. Be direct and practical, no fluff. When the user asks about current prices,',
      'flights, opening hours, visa/insurance rules, or anything time-sensitive, USE web search.',
      'Here is a snapshot of the user\'s current trip project (JSON):',
      JSON.stringify(projectSummary || {}),
      'When you find a concrete value the user could put into the app (e.g. a flight price for a specific',
      'date, a car rate, a park ticket price), state it plainly so they can enter it. Keep answers short.'
    ].join('\n');

    const messages = [];
    if (Array.isArray(history)) {
      history.slice(-6).forEach((m) => {
        if (m && m.role && m.content) messages.push({ role: m.role, content: String(m.content) });
      });
    }
    messages.push({ role: 'user', content: String(message) });

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 1024,
        system: system,
        messages: messages,
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }]
      })
    });

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      res.status(502).json({ error: 'Anthropic API error', detail: errText.slice(0, 500) });
      return;
    }

    const j = await anthropicRes.json();
    const text = (j.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    res.status(200).json({ reply: text || '(אין תשובה)' });
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
