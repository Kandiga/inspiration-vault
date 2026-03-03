import { createClient } from '@supabase/supabase-js';
import { YoutubeTranscript } from 'youtube-transcript';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

export async function handler(event) {
  // CORS headers
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

    // 1. Extract video ID
    const videoId = extractVideoId(url);
    if (!videoId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid YouTube URL' }) };
    }

    // 2. Fetch transcript using youtube-transcript package
    let transcript;
    try {
      const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'he' });
      transcript = transcriptItems.map(item => item.text).join(' ');
    } catch {
      // Try English if Hebrew fails
      try {
        const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
        transcript = transcriptItems.map(item => item.text).join(' ');
      } catch {
        // Try without language preference
        try {
          const transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
          transcript = transcriptItems.map(item => item.text).join(' ');
        } catch (e) {
          return {
            statusCode: 400,
            headers,
            body: JSON.stringify({
              error: 'לא הצלחתי למשוך כתוביות מהסרטון. ייתכן שלסרטון אין כתוביות זמינות.',
              details: e.message,
            }),
          };
        }
      }
    }

    if (!transcript || transcript.length < 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'הכתוביות קצרות מדי לניתוח.' }),
      };
    }

    // Limit transcript length
    transcript = transcript.slice(0, 8000);

    // 3. Get video title from oEmbed
    let videoTitle = '';
    try {
      const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (oembedRes.ok) {
        const oembedData = await oembedRes.json();
        videoTitle = oembedData.title || '';
      }
    } catch {
      // title is optional
    }

    // 4. Analyze with Gemini Flash (FREE!)
    const analysis = await analyzeWithGemini(transcript, videoTitle);

    // 5. Save to Supabase
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

// --- Gemini AI Analysis (FREE tier!) ---

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
