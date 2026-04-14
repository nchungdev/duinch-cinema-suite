import { useState } from 'react';
import { DiscoveryGrid } from './components/DiscoveryGrid';
import { MovieDetail } from './components/MovieDetail';
import { Search, Play, Settings } from 'lucide-react';

const CATEGORIES = [
  { id: 'new', label: 'Mới cập nhật' },
  { id: 'phim-le', label: 'Phim Lẻ' },
  { id: 'phim-bo', label: 'Phim Bộ' },
  { id: 'hoat-hinh', label: 'Hoạt Hình' },
  { id: 'phim-chieu-rap', label: 'Chiếu Rạp' },
];

function App() {
  const [category, setCategory] = useState('new');
  const [view, setView] = useState<'discovery' | 'detail'>('discovery');
  const [slug, setSlug] = useState<string | null>(null);

  const handleMovieClick = (clickedSlug: string) => {
    setSlug(clickedSlug);
    setView('detail');
  };

  return (
    <div className="min-h-screen bg-background text-white selection:bg-blue-500/30">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass h-16 px-6 flex items-center justify-between border-b border-white/5">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)]">
              <Play className="w-4 h-4 fill-white" />
            </div>
            <span className="font-black italic text-xl tracking-tighter uppercase">Cinema<span className="text-blue-500">Pro</span></span>
          </div>

          <div className="hidden md:flex items-center gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => { setCategory(cat.id); setView('discovery'); }}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                  category === cat.id && view === 'discovery' ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Search cinematic universe..." 
              className="bg-white/5 border border-white/5 rounded-2xl pl-10 pr-4 py-2 text-[10px] w-64 focus:outline-none focus:border-blue-500/30 transition-all font-black"
            />
          </div>
          <button className="p-2.5 rounded-xl hover:bg-white/5 text-gray-400 transition-all"><Settings className="w-5 h-5" /></button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="pt-24 pb-12 px-6 max-w-[1920px] mx-auto">
        {view === 'discovery' ? (
          <div className="space-y-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-1.5 h-8 bg-blue-600 rounded-full shadow-[0_0_15px_rgba(37,99,235,0.6)]"></div>
                <h1 className="text-4xl font-black italic uppercase tracking-tighter">
                  {CATEGORIES.find(c => c.id === category)?.label}
                </h1>
              </div>
            </div>
            
            <DiscoveryGrid category={category} onMovieClick={handleMovieClick} />
          </div>
        ) : (
          slug && <MovieDetail slug={slug} onBack={() => setView('discovery')} />
        )}
      </main>

      {/* Background Ambience */}
      <div className="fixed top-0 right-0 -z-10 w-[500px] h-[500px] bg-blue-600/5 blur-[120px] rounded-full pointer-events-none"></div>
      <div className="fixed bottom-0 left-0 -z-10 w-[500px] h-[500px] bg-purple-600/5 blur-[120px] rounded-full pointer-events-none"></div>
    </div>
  );
}

export default App;
