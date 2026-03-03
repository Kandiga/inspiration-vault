import { getCategoryStyle } from '../lib/categories.js';

export default function IdeaCard({ idea, onClick }) {
  const cat = getCategoryStyle(idea.category);
  const videoId = extractVideoId(idea.youtube_url);
  const thumbnail = videoId
    ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
    : null;

  return (
    <div
      onClick={onClick}
      className={`card-hover cursor-pointer rounded-2xl border ${cat.color} overflow-hidden backdrop-blur-sm`}
    >
      {/* Thumbnail */}
      {thumbnail && (
        <div className="relative">
          <img
            src={thumbnail}
            alt={idea.title}
            className="w-full h-40 object-cover"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-2 right-2">
            <span className={`${cat.badge} text-white text-xs px-2 py-1 rounded-full`}>
              {cat.label}
            </span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="p-4">
        <h3 className="font-bold text-white mb-2 line-clamp-2">{idea.title}</h3>
        <p className="text-sm text-gray-400 line-clamp-3 leading-relaxed">{idea.summary}</p>

        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
          <time className="text-xs text-gray-500">
            {new Date(idea.created_at).toLocaleDateString('he-IL')}
          </time>
          {idea.notes && (
            <span className="text-xs text-indigo-400">📝 יש הערות</span>
          )}
        </div>
      </div>
    </div>
  );
}

function extractVideoId(url) {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{11})/);
  return match ? match[1] : null;
}
