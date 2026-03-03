import { useState, useEffect } from 'react';
import { supabase } from './lib/supabase.js';
import { CATEGORIES } from './lib/categories.js';
import Header from './components/Header.jsx';
import AddVideoForm from './components/AddVideoForm.jsx';
import IdeaCard from './components/IdeaCard.jsx';
import IdeaModal from './components/IdeaModal.jsx';

export default function App() {
  const [ideas, setIdeas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [processing, setProcessing] = useState(false);

  // Fetch ideas from Supabase
  useEffect(() => {
    fetchIdeas();

    // Real-time subscription
    const channel = supabase
      .channel('ideas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setIdeas((prev) => [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setIdeas((prev) => prev.map((i) => (i.id === payload.new.id ? payload.new : i)));
        } else if (payload.eventType === 'DELETE') {
          setIdeas((prev) => prev.filter((i) => i.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  async function fetchIdeas() {
    setLoading(true);
    const { data, error } = await supabase
      .from('ideas')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error) setIdeas(data || []);
    setLoading(false);
  }

  async function handleAddVideo(youtubeUrl, transcript) {
    setProcessing(true);
    try {
      const res = await fetch('https://agent.kandiga.bot/vault-api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: youtubeUrl, transcript }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to analyze video');
      }

      const data = await res.json();
      return data;
    } catch (err) {
      alert(`שגיאה: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }

  async function handleUpdateNotes(id, notes) {
    await supabase.from('ideas').update({ notes }).eq('id', id);
  }

  async function handleDelete(id) {
    if (!confirm('למחוק את הרעיון הזה?')) return;
    await supabase.from('ideas').delete().eq('id', id);
    setSelectedIdea(null);
  }

  const filteredIdeas =
    activeCategory === 'all' ? ideas : ideas.filter((i) => i.category === activeCategory);

  const categoryCounts = ideas.reduce((acc, idea) => {
    acc[idea.category] = (acc[idea.category] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="min-h-screen">
      <Header count={ideas.length} />

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Add Video Form */}
        <AddVideoForm onSubmit={handleAddVideo} processing={processing} />

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap gap-2 mb-8 justify-center">
          <button
            onClick={() => setActiveCategory('all')}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
              activeCategory === 'all'
                ? 'bg-indigo-500 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            הכל ({ideas.length})
          </button>
          {Object.entries(CATEGORIES).map(([key, cat]) => (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                activeCategory === key
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              {cat.label} ({categoryCounts[key] || 0})
            </button>
          ))}
        </div>

        {/* Ideas Grid */}
        {loading ? (
          <div className="text-center py-20">
            <div className="inline-block w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-gray-400">טוען רעיונות...</p>
          </div>
        ) : filteredIdeas.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-6xl mb-4">💡</p>
            <p className="text-gray-400 text-lg">
              {ideas.length === 0
                ? 'הכספת ריקה — הדבק לינק יוטיוב למעלה כדי להתחיל!'
                : 'אין רעיונות בקטגוריה הזו'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredIdeas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} onClick={() => setSelectedIdea(idea)} />
            ))}
          </div>
        )}
      </main>

      {/* Detail Modal */}
      {selectedIdea && (
        <IdeaModal
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onUpdateNotes={handleUpdateNotes}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
