const videoId = '8S0FDjFBj8o';

const instances = [
  'https://pipedapi.kavin.rocks',
  'https://pipedapi.adminforge.de',
  'https://api.piped.yt',
];

for (const instance of instances) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(`${instance}/streams/${videoId}`, { signal: controller.signal });
    clearTimeout(timeout);
    console.log(`${instance}: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log('  Title:', data.title);
      console.log('  Subtitles:', data.subtitles?.length);
      if (data.subtitles?.length) {
        for (const s of data.subtitles.slice(0, 3)) {
          console.log(`    ${s.code}: ${s.url?.substring(0, 80)}`);
        }
        // Try to fetch first subtitle
        const sub = data.subtitles.find(s => s.code === 'en') || data.subtitles[0];
        if (sub?.url) {
          const subRes = await fetch(sub.url);
          console.log('  Sub status:', subRes.status);
          const text = await subRes.text();
          console.log('  Sub length:', text.length);
          console.log('  First 200:', text.substring(0, 200));
        }
      }
    }
  } catch (e) {
    console.log(`${instance}: ${e.message}`);
  }
}
