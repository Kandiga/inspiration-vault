export const CATEGORIES = {
  app_idea: {
    label: '💡 רעיון לאפליקציה',
    color: 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300',
    badge: 'bg-indigo-500',
  },
  business_model: {
    label: '💰 מודל עסקי',
    color: 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300',
    badge: 'bg-emerald-500',
  },
  technology: {
    label: '⚡ טכנולוגיה',
    color: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300',
    badge: 'bg-cyan-500',
  },
  inspiration: {
    label: '✨ השראה כללית',
    color: 'bg-amber-500/20 border-amber-500/50 text-amber-300',
    badge: 'bg-amber-500',
  },
  content: {
    label: '🎬 תוכן ויצירה',
    color: 'bg-pink-500/20 border-pink-500/50 text-pink-300',
    badge: 'bg-pink-500',
  },
};

export function getCategoryStyle(category) {
  return CATEGORIES[category] || CATEGORIES.inspiration;
}
