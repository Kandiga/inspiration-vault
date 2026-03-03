import { useState } from 'react';
import { getCategoryStyle } from '../lib/categories.js';

export default function IdeaModal({ idea, onClose, onUpdateNotes, onDelete }) {
  const [notes, setNotes] = useState(idea.notes || '');
  const [editing, setEditing] = useState(false);
  const cat = getCategoryStyle(idea.category);
  const videoId = extractVideoId(idea.youtube_url);

  function handleSaveNotes() {
    onUpdateNotes(idea.id, notes);
    setEditing(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-gray-900 border border-white/10 rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Video Embed */}
        {videoId && (
          <div className="aspect-video w-full">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title={idea.title}
              className="w-full h-full rounded-t-3xl"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
              allowFullScreen
            />
          </div>
        )}

        <div className="p-6">
          {/* Category Badge */}
          <span className={`${cat.badge} text-white text-xs px-3 py-1 rounded-full`}>
            {cat.label}
          </span>

          {/* Title */}
          <h2 className="text-2xl font-bold text-white mt-4 mb-3">{idea.title}</h2>

          {/* Summary */}
          <div className="bg-white/5 rounded-2xl p-4 mb-4">
            <h3 className="text-sm font-semibold text-indigo-400 mb-2">📋 סיכום הרעיון</h3>
            <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{idea.summary}</p>
          </div>

          {/* Key Insights */}
          {idea.key_insights && (
            <div className="bg-white/5 rounded-2xl p-4 mb-4">
              <h3 className="text-sm font-semibold text-amber-400 mb-2">💎 תובנות מפתח</h3>
              <p className="text-gray-300 leading-relaxed whitespace-pre-wrap">{idea.key_insights}</p>
            </div>
          )}

          {/* Notes */}
          <div className="bg-white/5 rounded-2xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-emerald-400">📝 ההערות שלי</h3>
              <button
                onClick={() => (editing ? handleSaveNotes() : setEditing(true))}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                {editing ? '💾 שמור' : '✏️ ערוך'}
              </button>
            </div>
            {editing ? (
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="הוסף הערות, רעיונות להמשך, תכניות..."
                className="w-full bg-black/30 border border-white/10 rounded-xl p-3 text-gray-300 placeholder-gray-600 focus:outline-none focus:border-indigo-500 resize-none"
              />
            ) : (
              <p className="text-gray-400 text-sm">
                {notes || 'אין הערות עדיין. לחץ על ערוך כדי להוסיף.'}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between pt-4 border-t border-white/10">
            <div className="flex gap-2">
              <a
                href={idea.youtube_url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-red-500/20 text-red-300 px-4 py-2 rounded-xl text-sm hover:bg-red-500/30 transition-all"
              >
                ▶️ צפה ביוטיוב
              </a>
              <button
                onClick={() => onDelete(idea.id)}
                className="bg-red-500/10 text-red-400 px-4 py-2 rounded-xl text-sm hover:bg-red-500/20 transition-all"
              >
                🗑️ מחק
              </button>
            </div>
            <button
              onClick={onClose}
              className="bg-white/5 text-gray-400 px-4 py-2 rounded-xl text-sm hover:bg-white/10 transition-all"
            >
              סגור
            </button>
          </div>

          <p className="text-xs text-gray-600 mt-4 text-center">
            נוסף ב-{new Date(idea.created_at).toLocaleString('he-IL')}
          </p>
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
