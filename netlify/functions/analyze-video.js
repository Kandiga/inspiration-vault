import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Service key for server-side writes
);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { url } = JSON.parse(event.body);

    if (!url) {
      return { statusCode: 400, body: JSON.stringify({ error: 'URL is required' }) };
    }

    // 1. Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Invalid YouTube URL' }) };
    }

    // 2. Fetch transcript
    const transcript = await fetchTranscript(videoId);
    if (!transcript) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Could not fetch transcript. The video may not have captions.' }),
      };
    }

    // 3. Analyze with Claude Haiku
    const analysis = await analyzeWithClaude(transcript, url);

    // 4. Save to Supabase
    const { data, error } = await supabase.from('ideas').insert({
      youtube_url: url,
      video_id: videoId,
      title: analysis.title,
      summary: analysis.summary,
      category: analysis.category,
      key_insights: analysis.key_insights,
      thumbnail: `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
    }).select().single();

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, idea: data }),
    };
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
}

// --- YouTube Transcript Fetching ---

async function fetchTranscript(videoId) {
  // Try fetching from YouTube's timedtext API (no auth needed for public captions)
  const languages = ['he', 'en', 'iw', 'auto'];

  for (const lang of languages) {
    try {
      // First, get the video page to extract caption tracks
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`);
      const pageHtml = await pageRes.text();

      // Extract captions URL from player response
      const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
      if (!captionMatch) continue;

      const tracks = JSON.parse(captionMatch[1]);
      if (!tracks.length) continue;

      // Prefer the requested language, fallback to first available
      const track =
        tracks.find((t) => t.languageCode === lang) ||
        tracks.find((t) => t.kind === 'asr') ||
        tracks[0];

      if (!track?.baseUrl) continue;

      const captionRes = await fetch(track.baseUrl + '&fmt=json3');
      const captionData = await captionRes.json();

      if (captionData.events) {
        const text = captionData.events
          .filter((e) => e.segs)
          .map((e) => e.segs.map((s) => s.utf8).join(''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (text.length > 50) {
          // Truncate to ~8000 chars to fit in Claude context
          return text.slice(0, 8000);
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

// --- Claude AI Analysis ---

async function analyzeWithClaude(transcript, videoUrl) {
  const prompt = `אתה מנתח תוכן מיוטיוב. קיבלת תמליל של סרטון. נתח אותו והחזר JSON בלבד.

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

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-20250514',
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

  // Parse JSON from response (handle potential markdown wrapping)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI response');

  const analysis = JSON.parse(jsonMatch[0]);

  // Validate category
  const validCategories = ['app_idea', 'business_model', 'technology', 'inspiration', 'content'];
  if (!validCategories.includes(analysis.category)) {
    analysis.category = 'inspiration';
  }

  return analysis;
}

// --- Helpers ---

function extractVideoId(url) {
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}
