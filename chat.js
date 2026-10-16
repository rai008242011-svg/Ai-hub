// Vercel サーバー関数: /api/chat
// 環境変数: ANTHROPIC_API_KEY (必須) / APP_PASSCODE (任意の合言葉) / ANTHROPIC_MODEL (任意)

const SYSTEM = [
  'あなたはORRERYという音声対話アシスタントです。ユーザーとは声で会話しています。',
  '返答は日本語で、話し言葉で、1〜3文の短さにしてください。',
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

  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY が未設定です（Vercelの環境変数に追加して再デプロイ）' });
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
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        max_tokens: 400,
        system,
        messages: msgs
      })
    });
    const j = await r.json();
    if (!r.ok) {
      res.status(502).json({ error: (j.error && j.error.message) || ('API エラー ' + r.status) });
      return;
    }
    const reply = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    res.status(200).json({ reply });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
