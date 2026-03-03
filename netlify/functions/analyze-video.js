import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Browser-like headers to avoid YouTube blocking
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,he;q=0.8',
  'Accept-Encoding': 'identity',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
  'Cache-Control': 'max-age=0',
};

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

    // 1. Fetch transcript (try multiple methods)
    const transcriptResult = await fetchTranscriptMultiMethod(videoId);
    if (!transcriptResult.transcript) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: transcriptResult.error || 'Could not fetch transcript',
          videoId,
        }),
      };
    }

    // 2. Analyze with Gemini
    const analysis = await analyzeWithGemini(transcriptResult.transcript, transcriptResult.title);

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

// --- Transcript Fetching (Multiple Methods) ---

async function fetchTranscriptMultiMethod(videoId) {
  // Method 1: Direct innertube API
  try {
    const result = await fetchViaInnertube(videoId);
    if (result) return result;
  } catch (e) {
    console.log('Innertube method failed:', e.message);
  }

  // Method 2: Scrape watch page
  try {
    const result = await fetchViaScraping(videoId);
    if (result) return result;
  } catch (e) {
    console.log('Scraping method failed:', e.message);
  }

  // Method 3: Try timedtext API directly
  try {
    const result = await fetchViaTimedText(videoId);
    if (result) return result;
  } catch (e) {
    console.log('TimedText method failed:', e.message);
  }

  return { transcript: null, title: '', error: 'לא הצלחתי למשוך כתוביות. נסה סרטון אחר עם כתוביות זמינות.' };
}

// Method 1: YouTube Innertube API (internal YouTube API)
async function fetchViaInnertube(videoId) {
  // First get the page to extract the visitor data
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: BROWSER_HEADERS,
  });
  const pageHtml = await pageRes.text();

  // Extract video title
  const titleMatch = pageHtml.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : '';

  // Extract caption tracks from player response
  const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
  if (!captionMatch) {
    return null;
  }

  let tracks;
  try {
    tracks = JSON.parse(captionMatch[1]);
  } catch {
    return null;
  }

  if (!tracks.length) return null;

  // Prefer Hebrew, then English, then auto-generated, then first
  const track =
    tracks.find((t) => t.languageCode === 'he') ||
    tracks.find((t) => t.languageCode === 'iw') ||
    tracks.find((t) => t.languageCode === 'en') ||
    tracks.find((t) => t.kind === 'asr') ||
    tracks[0];

  if (!track?.baseUrl) return null;

  // Fetch the actual captions
  const captionRes = await fetch(track.baseUrl + '&fmt=json3', {
    headers: BROWSER_HEADERS,
  });

  if (!captionRes.ok) return null;

  const captionData = await captionRes.json();

  if (captionData.events) {
    const text = captionData.events
      .filter((e) => e.segs)
      .map((e) => e.segs.map((s) => s.utf8).join(''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length > 50) {
      return { transcript: text.slice(0, 8000), title };
    }
  }

  return null;
}

// Method 2: Simple scraping with XML format
async function fetchViaScraping(videoId) {
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
    headers: {
      ...BROWSER_HEADERS,
      'Cookie': 'CONSENT=YES+; GPS=1',
    },
  });
  const pageHtml = await pageRes.text();

  const titleMatch = pageHtml.match(/<title>([^<]*)<\/title>/);
  const title = titleMatch ? titleMatch[1].replace(' - YouTube', '').trim() : '';

  // Try to find captions URL in the page
  const captionUrlMatch = pageHtml.match(/"baseUrl":"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/);
  if (!captionUrlMatch) return null;

  const captionUrl = captionUrlMatch[1].replace(/\\u0026/g, '&');

  const captionRes = await fetch(captionUrl, {
    headers: BROWSER_HEADERS,
  });

  if (!captionRes.ok) return null;

  const captionXml = await captionRes.text();

  // Parse XML captions
  const textSegments = [...captionXml.matchAll(/<text[^>]*>(.*?)<\/text>/gs)];
  if (textSegments.length === 0) return null;

  const text = textSegments
    .map((m) => m[1])
    .join(' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length > 50) {
    return { transcript: text.slice(0, 8000), title };
  }

  return null;
}

// Method 3: Direct timedtext API
async function fetchViaTimedText(videoId) {
  const languages = ['he', 'iw', 'en', 'auto'];

  for (const lang of languages) {
    try {
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
      const res = await fetch(url, { headers: BROWSER_HEADERS });
      if (!res.ok) continue;

      const data = await res.json();
      if (data.events) {
        const text = data.events
          .filter((e) => e.segs)
          .map((e) => e.segs.map((s) => s.utf8).join(''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();

        if (text.length > 50) {
          // Get title via oEmbed
          let title = '';
          try {
            const oRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
            if (oRes.ok) {
              const oData = await oRes.json();
              title = oData.title || '';
            }
          } catch { /* */ }

          return { transcript: text.slice(0, 8000), title };
        }
      }
    } catch {
      continue;
    }
  }

  return null;
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
