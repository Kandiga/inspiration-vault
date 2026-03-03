const videoId = '8S0FDjFBj8o';
const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
const html = await res.text();

// Extract ytInitialPlayerResponse
const match = html.match(/var ytInitialPlayerResponse\s*=\s*(\{.*?\});\s*(?:var|<\/script)/s);
if (match) {
  try {
    const data = JSON.parse(match[1]);
    console.log('Keys:', Object.keys(data));
    console.log('Has captions:', !!data.captions);
    if (data.captions) {
      console.log('Captions:', JSON.stringify(data.captions).substring(0, 500));
    }
    // Check playability
    console.log('Playability:', data.playabilityStatus?.status);
    console.log('Playability reason:', data.playabilityStatus?.reason);
  } catch (e) {
    console.log('JSON parse failed:', e.message);
    // Try to find captions in raw match
    const capIdx = match[1].indexOf('caption');
    if (capIdx > -1) console.log('Caption found at:', capIdx, match[1].substring(capIdx, capIdx+200));
  }
} else {
  console.log('No ytInitialPlayerResponse found');
  // Try alternate pattern
  const alt = html.match(/ytInitialPlayerResponse\s*=\s*\{/);
  console.log('Alt match:', !!alt);
}

// Also check ytInitialData
const dataMatch = html.match(/var ytInitialData\s*=\s*(\{.*?\});\s*(?:var|<\/script)/s);
if (dataMatch) {
  const str = dataMatch[1];
  const capIdx = str.indexOf('caption');
  console.log('ytInitialData has caption:', capIdx > -1);
  if (capIdx > -1) console.log('Context:', str.substring(capIdx - 20, capIdx + 200));
}
