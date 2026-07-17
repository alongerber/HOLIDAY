// Vercel Serverless Function — parses a booking/price screenshot with Claude vision.
// Deploy on Vercel and set env var ANTHROPIC_API_KEY. The key stays server-side.

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
    const { image, mediaType } = req.body || {};
    if (!image) {
      res.status(400).json({ error: 'No image provided.' });
      return;
    }

    const prompt = [
      'You are parsing a screenshot of a travel booking confirmation, price page, or email.',
      'It may be in Hebrew or English. Extract the key cost information.',
      'Respond with ONLY a JSON object (no markdown, no prose), with these fields',
      '(use null when a field is not present):',
      '{',
      '  "category": one of "hotel","flight","car","insurance","activity","transfer","other",',
      '  "vendor": "name of the hotel / airline / rental company / provider",',
      '  "destination": "city or airport if shown",',
      '  "amount": numeric total (just the number, no symbols),',
      '  "currency": "EUR" | "ILS" | "USD" | other ISO code,',
      '  "date": "date or date-range as shown",',
      '  "confirmation": "booking reference / confirmation number if shown",',
      '  "note": "one short sentence in Hebrew summarizing what this is"',
      '}'
    ].join('\n');

    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5', // swap to another model string if you prefer
        max_tokens: 700,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType || 'image/png', data: image }
              },
              { type: 'text', text: prompt }
            ]
          }
        ]
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
      .join('')
      .trim();

    let data;
    try {
      data = JSON.parse(text.replace(/```json/gi, '').replace(/```/g, '').trim());
    } catch (e) {
      data = { category: 'other', vendor: null, amount: null, currency: null, date: null, note: text.slice(0, 200) };
    }

    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
