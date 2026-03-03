import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

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

    // Get video title via oEmbed (lightweight, always works)
    let videoTitle = '';
    try {
      const oRes = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (oRes.ok) {
        const oData = await oRes.json();
        videoTitle = oData.title || '';
      }
    } catch { /* title is optional */ }

    // Analyze with Gemini using direct YouTube URL (Gemini natively understands YouTube!)
    const analysis = await analyzeWithGemini(videoId, videoTitle);

    // Save to Supabase
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

// --- Gemini AI Analysis (Direct YouTube Video Understanding) ---

async function analyzeWithGemini(videoId, videoTitle) {
  const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const titleHint = videoTitle ? `\nכותרת הסרטון: ${videoTitle}` : '';

  const prompt = `נתח את סרטון היוטיוב הזה. זהה את הרעיון המרכזי, תן סיכום, קטגוריה ותובנות מפתח.
${titleHint}

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
        contents: [{
          parts: [
            {
              fileData: {
                mimeType: 'video/mp4',
                fileUri: youtubeUrl,
              },
            },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    console.error('Gemini error:', errText);
    throw new Error(`Gemini API error: ${res.status}`);
  }

  const data = await res.json();

  if (!data.candidates?.[0]?.content?.parts?.[0]?.text) {
    throw new Error('Empty response from Gemini');
  }

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
