const videoId = '8S0FDjFBj8o';
const url = `https://inv.nadeko.net/api/v1/videos/${videoId}?fields=title,captions`;
const res = await fetch(url, { headers: { Accept: 'application/json' } });
console.log('Status:', res.status);
if (res.ok) {
  const data = await res.json();
  console.log('Title:', data.title);
  console.log('Captions:', data.captions?.length);
  if (data.captions?.length) {
    const cap = data.captions.find(c => c.language_code === 'en') || data.captions[0];
    console.log('Using:', cap.label, cap.language_code);
    const capUrl = cap.url.startsWith('http') ? cap.url : `https://inv.nadeko.net${cap.url}`;
    console.log('Caption URL:', capUrl);
    const capRes = await fetch(capUrl);
    console.log('Caption status:', capRes.status);
    const text = await capRes.text();
    console.log('Caption text length:', text.length);
    console.log('First 200:', text.substring(0, 200));
  }
} else {
  console.log('Body:', await res.text());
}
