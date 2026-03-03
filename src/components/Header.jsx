export default function Header({ count }) {
  return (
    <header className="border-b border-white/10 bg-black/30 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-500/20 rounded-xl flex items-center justify-center pulse-glow">
            <span className="text-xl">💡</span>
          </div>
          <div>
            <h1 className="text-xl font-bold bg-gradient-to-l from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              כספת רעיונות
            </h1>
            <p className="text-xs text-gray-500">Inspiration Vault</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="bg-indigo-500/20 px-3 py-1 rounded-full text-indigo-300 font-medium">
            {count} רעיונות
          </span>
        </div>
      </div>
    </header>
  );
}
