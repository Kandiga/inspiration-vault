const videoId = '8S0FDjFBj8o';

// Try Android client (less restrictive)
const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8&prettyPrint=false', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'com.google.android.youtube/17.36.4 (Linux; U; Android 12; GB) gzip' },
  body: JSON.stringify({
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '17.36.4',
        androidSdkVersion: 31,
        hl: 'en',
        gl: 'US',
      }
    },
    videoId,
  })
});

const data = await res.json();
console.log('Status:', data.playabilityStatus?.status);
console.log('Has captions:', !!data.captions);
console.log('Keys:', Object.keys(data));

if (data.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
  const tracks = data.captions.playerCaptionsTracklistRenderer.captionTracks;
  console.log('Tracks:', tracks.length);
  for (const t of tracks) {
    console.log(`  ${t.languageCode} (${t.name?.simpleText}): ${t.baseUrl?.substring(0, 80)}`);
  }
  
  const track = tracks.find(t => t.languageCode === 'en') || tracks[0];
  const capRes = await fetch(track.baseUrl + '&fmt=json3');
  const capData = await capRes.json();
  const text = capData.events?.filter(e => e.segs).map(e => e.segs.map(s => s.utf8).join('')).join(' ').trim();
  console.log('Transcript length:', text?.length);
  console.log('First 200:', text?.substring(0, 200));
}

// Also try WEB_EMBEDDED_PLAYER
const res2 = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    context: {
      client: {
        clientName: 'WEB_EMBEDDED_PLAYER',
        clientVersion: '1.20240101.00.00',
        hl: 'en',
      }
    },
    videoId,
  })
});
const data2 = await res2.json();
console.log('\nWEB_EMBEDDED: captions?', !!data2.captions);
if (data2.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
  console.log('Embedded tracks:', data2.captions.playerCaptionsTracklistRenderer.captionTracks.length);
}
