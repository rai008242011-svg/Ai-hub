// Vercel サーバー関数: /api/chat （Groq版）
// 環境変数: GROQ_API_KEY (必須) / APP_PASSCODE (任意の合言葉) / GROQ_MODEL (任意)

const SYSTEM = [
  'あなたはORRERYという音声対話アシスタントです。ユーザーとは声で会話しています。',
  '必ず自然な日本語の話し言葉で、1〜3文の短さで返答してください。',
  'あなたの返答は音声で読み上げられます。Markdown、箇条書き、記号、絵文字、URLは使わないでください。',
  '長い説明を求められたら要点だけ話し、続きを聞きたいか尋ねてください。',
  'わからないことは、わからないと正直に答えてください。'
].join('\n');

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POSTだけ使えます' });
    return;
  }

  const pass = process.env.APP_PASSCODE;
  if (pass && req.headers['x-pass'] !== pass) {
    res.status(401).json({ error: '合言葉が違います' });
    return;
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'GROQ_API_KEY が未設定です（Vercelの環境変数に追加して再デプロイ）' });
    return;
  }

  const body = req.body || {};
  if (!Array.isArray(body.messages) || !body.messages.length) {
    res.status(400).json({ error: 'messages が必要です' });
    return;
  }

  const msgs = body.messages.slice(-16).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000)
  }));
  while (msgs.length && msgs[0].role !== 'user') msgs.shift();
  if (!msgs.length) {
    res.status(400).json({ error: 'user のメッセージが必要です' });
    return;
  }

  const system = SYSTEM + (body.context ? '\n\n現在の状況: ' + String(body.context).slice(0, 400) : '');

  try {
    const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
           model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
   max_completion_tokens: 1500,
   reasoning_effort: 'low',
   temperature: 0.7,
        messages: [{ role: 'system', content: system }, ...msgs]
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      res.status(502).json({ error: (j.error && j.error.message) || ('Groq エラー ' + r.status) });
      return;
    }
    const reply = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
    if (!reply) {
      res.status(502).json({ error: '返事が空でした。もう一度話しかけてください' });
      return;
    }
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
