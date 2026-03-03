const res = await fetch('https://www.youtube.com/watch?v=8S0FDjFBj8o', {
  headers: { 'User-Agent': 'Mozilla/5.0' }
});
const html = await res.text();
console.log('Page length:', html.length);
console.log('Has captionTracks:', html.includes('captionTracks'));
console.log('Has ytInitialPlayerResponse:', html.includes('ytInitialPlayerResponse'));
console.log('Has playerCaptionsTracklistRenderer:', html.includes('playerCaptionsTracklistRenderer'));

// Try to find any caption-related content
const captionIdx = html.indexOf('caption');
if (captionIdx > -1) {
  console.log('Caption context:', html.substring(captionIdx - 20, captionIdx + 100));
}

// Check if it's a bot-detection page
if (html.length < 50000) {
  console.log('SHORT PAGE - likely bot detection');
  console.log('First 500 chars:', html.substring(0, 500));
}
