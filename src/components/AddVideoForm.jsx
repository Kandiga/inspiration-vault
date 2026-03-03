import { useState } from 'react';

export default function AddVideoForm({ onSubmit, processing }) {
  const [url, setUrl] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    if (!url.trim()) return;

    // Basic YouTube URL validation
    const ytRegex = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/;
    if (!ytRegex.test(url)) {
      alert('אנא הכנס לינק יוטיוב תקין');
      return;
    }

    onSubmit(url.trim());
    setUrl('');
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl mx-auto mb-10">
      <div className="relative">
        <div className="flex gap-3">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="הדבק לינק יוטיוב כאן..."
            disabled={processing}
            className="flex-1 bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={processing || !url.trim()}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white px-6 py-4 rounded-2xl font-medium transition-all flex items-center gap-2"
          >
            {processing ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                מנתח...
              </>
            ) : (
              <>
                <span>🔍</span>
                נתח
              </>
            )}
          </button>
        </div>
        {processing && (
          <p className="text-center text-sm text-indigo-400 mt-3 animate-pulse">
            ⏳ שולף תמליל, מנתח עם AI, ושומר לכספת...
          </p>
        )}
      </div>
    </form>
  );
}
