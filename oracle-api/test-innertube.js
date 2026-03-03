// Test InnerTube API for getting captions
const videoId = '8S0FDjFBj8o';

// First, get the page to extract the API key
const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
const html = await pageRes.text();

// Extract innertubeApiKey
const apiKeyMatch = html.match(/"innertubeApiKey":"([^"]+)"/);
const apiKey = apiKeyMatch ? apiKeyMatch[1] : 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
console.log('API Key:', apiKey);

// Call InnerTube player endpoint
const playerRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${apiKey}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0' },
  body: JSON.stringify({
    context: {
      client: {
        clientName: 'WEB',
        clientVersion: '2.20240101.00.00',
        hl: 'en',
      }
    },
    videoId: videoId,
  })
});

const playerData = await playerRes.json();
const captions = playerData.captions;
console.log('Has captions:', !!captions);

if (captions?.playerCaptionsTracklistRenderer?.captionTracks) {
  const tracks = captions.playerCaptionsTracklistRenderer.captionTracks;
  console.log('Tracks:', tracks.length);
  tracks.forEach(t => console.log(`  ${t.languageCode}: ${t.baseUrl?.substring(0, 80)}...`));
  
  // Fetch first track
  const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
  const capRes = await fetch(track.baseUrl + '&fmt=json3');
  const capData = await capRes.json();
  const text = capData.events?.filter(e => e.segs).map(e => e.segs.map(s => s.utf8).join('')).join(' ').trim();
  console.log('Transcript length:', text.length);
  console.log('First 200 chars:', text.substring(0, 200));
} else {
  console.log('No caption tracks found');
  console.log('Player response keys:', Object.keys(playerData));
}
