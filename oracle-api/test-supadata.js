const videoId = '8S0FDjFBj8o';
const url = `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}&text=true`;
const res = await fetch(url);
console.log('Status:', res.status);
const text = await res.text();
console.log('Response:', text.substring(0, 500));
