const videoId = '8S0FDjFBj8o';

// Try multiple free transcript services
const services = [
  `https://yt.lemnoslife.com/captions?v=${videoId}`,
  `https://invidious.snopyta.org/api/v1/captions/${videoId}`,
  `https://vid.puffyan.us/api/v1/captions/${videoId}`,
  `https://inv.nadeko.net/api/v1/captions/${videoId}`,
  `https://invidious.nerdvpn.de/api/v1/captions/${videoId}`,
];

for (const url of services) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    console.log(`${new URL(url).hostname}: ${res.status}`);
    if (res.ok) {
      const data = await res.json();
      console.log('  Data:', JSON.stringify(data).substring(0, 200));
    }
  } catch (e) {
    console.log(`${new URL(url).hostname}: ${e.message}`);
  }
}
