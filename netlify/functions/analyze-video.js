import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Multiple Invidious instances for fallback
const INVIDIOUS_INSTANCES = [
  'https://vid.puffyan.us',
  'https://inv.tux.pizza',
  'https://invidious.nerdvpn.de',
  'https://inv.nadeko.net',
  'https://invidious.protokolla.fi',
];

export async function handler(event) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { url } = JSON.parse(event.body);

    if (!url) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'URL is required' }) };
    }

    const videoId = extractVideoId(url);
    if (!videoId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid YouTube URL' }) };
    }

    // 1. Get video info + transcript via Invidious
    const videoData = await fetchVideoData(videoId);
    if (!videoData.transcript) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: videoData.error || 'לא הצלחתי למשוך כתוביות. נסה סרטון אחר.',
          videoId,
        }),
      };
    }

    // 2. Analyze with Gemini
    const analysis = await analyzeWithGemini(videoData.transcript, videoData.title);

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

    if (error) throw error;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: true, idea: data }),
    };
  } catch (err) {
    console.error('Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message || 'Internal server error' }),
    };
  }
}

// --- Fetch Video Data via Invidious Instances ---

async function fetchVideoData(videoId) {
  const errors = [];

  for (const instance of INVIDIOUS_INSTANCES) {
    try {
      // Get video info (title etc)
      const infoRes = await fetch(`${instance}/api/v1/videos/${videoId}?fields=title,captions`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000),
      });

      if (!infoRes.ok) {
        errors.push(`${instance}: ${infoRes.status}`);
        continue;
      }

      const info = await infoRes.json();
      const title = info.title || '';

      if (!info.captions || info.captions.length === 0) {
        return { transcript: null, title, error: 'לסרטון הזה אין כתוביות זמינות.' };
      }

      // Find best caption track: prefer Hebrew, then English, then first
      const caption =
        info.captions.find(c => c.language_code === 'he' || c.language_code === 'iw') ||
        info.captions.find(c => c.language_code === 'en') ||
        info.captions.find(c => c.label?.includes('auto')) ||
        info.captions[0];

      if (!caption) {
        return { transcript: null, title, error: 'לא נמצאו כתוביות מתאימות.' };
      }

      // Fetch the caption content
      const captionUrl = caption.url?.startsWith('http')
        ? caption.url
        : `${instance}${caption.url}`;

      const captionRes = await fetch(captionUrl, {
        signal: AbortSignal.timeout(8000),
      });

      if (!captionRes.ok) {
        errors.push(`${instance} captions: ${captionRes.status}`);
        continue;
      }

      const captionText = await captionRes.text();

      // Parse VTT/SRT caption format
      const transcript = parseCaptions(captionText);

      if (transcript && transcript.length > 50) {
        return { transcript: transcript.slice(0, 8000), title };
      }

      errors.push(`${instance}: transcript too short`);
    } catch (e) {
      errors.push(`${instance}: ${e.message}`);
      continue;
    }
  }

  // All instances failed — try direct YouTube oEmbed for at least getting title
  console.error('All Invidious instances failed:', errors.join('; '));
  return {
    transcript: null,
    title: '',
    error: `לא הצלחתי למשוך כתוביות מאף שרת. נסה שוב מאוחר יותר.`,
  };
}

// Parse VTT/SRT caption text into plain text
function parseCaptions(rawText) {
  // Remove VTT header
  let text = rawText.replace(/WEBVTT\n\n/g, '');

  // Remove timestamps (00:00:00.000 --> 00:00:05.000)
  text = text.replace(/\d{2}:\d{2}[:.]\d{2}[.,]\d{3}\s*-->\s*\d{2}:\d{2}[:.]\d{2}[.,]\d{3}/g, '');

  // Remove cue numbers
  text = text.replace(/^\d+$/gm, '');

  // Remove HTML tags
  text = text.replace(/<[^>]+>/g, '');

  // Remove VTT positioning
  text = text.replace(/align:[\w]+\s*/g, '');
  text = text.replace(/position:[\d%]+\s*/g, '');

  // Decode HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');

  // Clean whitespace
  text = text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();

  return text;
}

// --- Gemini AI Analysis ---

async function analyzeWithGemini(transcript, videoTitle) {
  const titleContext = videoTitle ? `\nכותרת הסרטון: ${videoTitle}\n` : '';

  const prompt = `אתה מנתח תוכן מיוטיוב. קיבלת תמליל של סרטון. נתח אותו והחזר JSON בלבד.
${titleContext}
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

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  const text = data.candidates[0].content.parts[0].text.trim();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI response');

  const analysis = JSON.parse(jsonMatch[0]);

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
