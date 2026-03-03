import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

    // 3. Analyze with Gemini Flash (FREE!)
    const analysis = await analyzeWithGemini(transcript, url);

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
  try {
    // Fetch the video page to extract caption tracks
    const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'Accept-Language': 'en-US,en;q=0.9,he;q=0.8' },
    });
    const pageHtml = await pageRes.text();

    // Extract captions URL from player response
    const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) return null;

    const tracks = JSON.parse(captionMatch[1]);
    if (!tracks.length) return null;

    // Prefer Hebrew, then English, then first available
    const track =
      tracks.find((t) => t.languageCode === 'he') ||
      tracks.find((t) => t.languageCode === 'iw') ||
      tracks.find((t) => t.languageCode === 'en') ||
      tracks.find((t) => t.kind === 'asr') ||
      tracks[0];

    if (!track?.baseUrl) return null;

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
        return text.slice(0, 8000);
      }
    }
  } catch {
    // fall through
  }

  return null;
}

// --- Gemini AI Analysis (FREE tier!) ---

async function analyzeWithGemini(transcript, videoUrl) {
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

  // Parse JSON from response
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
