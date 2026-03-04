import { createServer } from 'http';
import { createClient } from '@supabase/supabase-js';
const PORT = process.env.PORT || 3847;
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ttkgywhqnybpoqsmbxar.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const API_SECRET = process.env.API_SECRET || '';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- HTTP Server ---
const server = createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', service: 'inspiration-vault-api' }));
    return;
  }

  // Main endpoint
  if (req.method === 'POST' && req.url === '/analyze') {
    // Optional API secret check
    if (API_SECRET) {
      const authHeader = req.headers.authorization || '';
      if (authHeader !== `Bearer ${API_SECRET}`) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }
    }

    let body = '';
    for await (const chunk of req) body += chunk;

    try {
      const { url, transcript: userTranscript } = JSON.parse(body);
      if (!url) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'URL is required' }));
        return;
      }

      const result = await analyzeVideo(url, userTranscript);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err) {
      console.error('Error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// --- Main Analysis Flow ---
async function analyzeVideo(url, userTranscript) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new Error('Invalid YouTube URL');

  let transcript, title = '';

  // Get title via oEmbed (always works)
  try {
    const oRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oRes.ok) { title = (await oRes.json()).title || ''; }
  } catch {}

  if (userTranscript && userTranscript.length > 50) {
    // User provided transcript directly
    transcript = userTranscript.slice(0, 8000);
    console.log(`Using user-provided transcript (${transcript.length} chars)`);
  } else {
    // Try auto-fetch via Invidious
    const result = await fetchTranscript(videoId);
    transcript = result.transcript;
    if (!title) title = result.title || '';
    if (!transcript) throw new Error(result.error || 'לא הצלחתי למשוך כתוביות. נסה להדביק תמליל ידנית.');
  }

  // 2. Analyze with Claude via Kali's OAuth token
  const analysis = await analyzeWithClaude(transcript, title);

  // 3. Save to Supabase
  const { data, error } = await supabase.from('ideas').insert({
    youtube_url: url,
    video_id: videoId,
    title: analysis.title,
    summary: analysis.summary,
    category: analysis.category,
    key_insights: analysis.key_insights,
    thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
  }).select().single();

  if (error) throw new Error(`Supabase error: ${error.message}`);

  return { success: true, idea: data };
}

// --- YouTube Transcript via Invidious API ---
const INVIDIOUS_INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://invidious.snopyta.org',
  'https://vid.puffyan.us',
];

async function fetchTranscript(videoId) {
  const errors = [];

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      // Get video info + available captions
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const infoRes = await fetch(`${instance}/api/v1/videos/${videoId}?fields=title,captions`, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' },
      });
      clearTimeout(timeout);

      if (!infoRes.ok) { errors.push(`${instance}: ${infoRes.status}`); continue; }

      const contentType = infoRes.headers.get('content-type') || '';
      if (!contentType.includes('json')) { errors.push(`${instance}: not json`); continue; }

      const info = await infoRes.json();
      const title = info.title || '';

      if (!info.captions?.length) {
        return { transcript: null, title, error: 'לסרטון הזה אין כתוביות זמינות.' };
      }

      // Prefer Hebrew > English > auto > first
      const caption =
        info.captions.find(c => c.language_code === 'he' || c.language_code === 'iw') ||
        info.captions.find(c => c.language_code === 'en') ||
        info.captions.find(c => c.label?.toLowerCase().includes('auto')) ||
        info.captions[0];

      // Fetch the actual caption text
      const captionUrl = caption.url?.startsWith('http') ? caption.url : `${instance}${caption.url}`;
      console.log(`Fetching captions from: ${captionUrl.substring(0, 80)}...`);

      const ctrl2 = new AbortController();
      const t2 = setTimeout(() => ctrl2.abort(), 10000);
      const capRes = await fetch(captionUrl, { signal: ctrl2.signal });
      clearTimeout(t2);

      if (!capRes.ok) { errors.push(`${instance} captions: ${capRes.status}`); continue; }

      const rawText = await capRes.text();

      // Parse VTT/SRT format
      let text = rawText
        .replace(/WEBVTT\n\n/g, '')
        .replace(/\d{2}:\d{2}[:.]\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}[:.]\d{2}[.,]\d{3}[^\n]*/g, '')
        .replace(/^\d+$/gm, '')
        .replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

      if (text.length > 50) {
        console.log(`Got transcript: ${text.length} chars from ${instance}`);
        return { transcript: text.slice(0, 8000), title };
      }

      errors.push(`${instance}: transcript too short (${text.length})`);
    } catch (e) {
      errors.push(`${instance}: ${e.message}`);
    }
  }

  console.error('All instances failed:', errors.join('; '));
  return { transcript: null, title: '', error: 'לא הצלחתי למשוך כתוביות אוטומטית. נסה להדביק תמליל ידנית.' };
}

// --- Claude Analysis (via Anthropic API with API Key) ---
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

async function analyzeWithClaude(transcript, videoTitle) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');

  const titleCtx = videoTitle ? `\nכותרת הסרטון: ${videoTitle}\n` : '';
  const prompt = `אתה מנתח תוכן מיוטיוב. קיבלת תמליל של סרטון. נתח אותו והחזר JSON בלבד.
${titleCtx}
תמליל הסרטון:
---
${transcript}
---

החזר JSON בדיוק בפורמט הזה (בעברית):
{
  "title": "כותרת קצרה וקולעת לרעיון המרכזי (עד 60 תווים)",
  "summary": "סיכום של 2-4 משפטים שמסביר את הרעיון המרכזי, למה הוא מעניין, ואיך אפשר ליישם אותו",
  "category": "אחת מ: app_idea | business_model | technology | inspiration | content",
  "key_insights": "3-5 תובנות מפתח מהסרטון, כל אחת בשורה חדשה עם •"
}

החזר JSON תקין בלבד, בלי markdown או טקסט נוסף.`;

  console.log('Calling Claude API...');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const text = data.content[0].text.trim();
  console.log('Claude response length:', text.length);

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI response: ' + text.slice(0, 200));

  const analysis = JSON.parse(jsonMatch[0]);
  const validCategories = ['app_idea', 'business_model', 'technology', 'inspiration', 'content'];
  if (!validCategories.includes(analysis.category)) analysis.category = 'inspiration';

  return analysis;
}

// --- Helpers ---
function extractVideoId(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}

// --- Start ---
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Inspiration Vault API running on port ${PORT}`);
});
