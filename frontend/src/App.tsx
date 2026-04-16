import { useState, useEffect } from 'react';
import { api } from './api/config';
import { DiscoveryGrid } from './components/DiscoveryGrid';
import { MovieDetail } from './components/MovieDetail';
import { Search, Play, Settings, Bell, User, Clapperboard, Monitor as MonitorIcon, Film, Compass, Tv } from 'lucide-react';

const CATEGORIES = [
  { id: 'new', label: 'Recommended', icon: <Compass className="w-4 h-4" /> },
  { id: 'phim-le', label: 'Movies', icon: <Film className="w-4 h-4" /> },
  { id: 'phim-bo', label: 'Series', icon: <Tv className="w-4 h-4" /> },
  { id: 'hoat-hinh', label: 'Animation', icon: <MonitorIcon className="w-4 h-4" /> },
  { id: 'phim-chieu-rap', label: 'Theatre', icon: <Clapperboard className="w-4 h-4" /> },
];

function App() {
  const [category, setCategory] = useState('new');
  const [view, setView] = useState<'discovery' | 'detail'>('discovery');
  const [slug, setSlug] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchSource, setSearchSource] = useState<'all' | 'tmdb' | 'kkphim'>('all');

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    try {
      const mappedCategory = category === 'new' || category === 'phim-chieu-rap' ? 'movie' : 
                             category === 'phim-bo' || category === 'hoat-hinh' ? 'tv' : 'all';
      const res = await api.get(`/search/${encodeURIComponent(searchQuery)}?media_type=${mappedCategory}`);
      const results = res.data?.results || [];
      setSearchResults(results);
      setView('discovery');
      setSlug(null);
      window.scrollTo({ top: 0, behavior: 'instant' });
    } catch (err) {
      console.error('Search failed:', err);
      setSearchResults([]);
    }
  };

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Browser History API Integration (Native navigation)
  useEffect(() => {
    window.history.replaceState({ view: 'discovery' }, '');
    const onPopState = (event: PopStateEvent) => {
      if (event.state?.view === 'detail' && event.state?.slug) {
        setView('detail');
        setSlug(event.state.slug);
      } else {
        setView('discovery');
        setSlug(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const handleMovieClick = (clickedSlug: string) => {
    window.history.pushState({ view: 'detail', slug: clickedSlug }, '');
    setSlug(clickedSlug);
    setView('detail');
    window.scrollTo({ top: 0, behavior: 'instant' });
  };


  const navToDiscoveryClear = (newCat?: string) => {
    if (view === 'detail') window.history.pushState({ view: 'discovery' }, '');
    setView('discovery');
    setSlug(null);
    setSearchResults(null);
    setSearchQuery('');
    if (newCat) {
      setCategory(newCat);
      setView('discovery');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-500/40 font-inter antialiased">
      {/* Dynamic Background Elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-600/5 blur-[120px] rounded-full" />
      </div>

      {/* Premium Navbar */}
      <nav className={`fixed top-0 left-0 right-0 z-[100] h-20 px-10 flex items-center justify-between transition-all duration-500 border-b ${
        scrolled ? 'bg-black/80 backdrop-blur-2xl border-white/10' : 'bg-transparent border-transparent'
      }`}>
        <div className="flex items-center gap-16">
          {/* Logo Section */}
          <div 
            className="flex items-center gap-3 cursor-pointer group" 
            onClick={() => navToDiscoveryClear('new')}
          >
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-700 to-blue-500 flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] group-hover:shadow-[0_0_30px_rgba(37,99,235,0.6)] transition-all duration-500">
              <Play className="w-6 h-6 fill-white text-white translate-x-0.5" />
            </div>
            <div className="flex flex-col">
              <span className="font-black italic text-2xl tracking-tighter uppercase leading-none font-outfit">
                Cinema<span className="text-blue-500">Pro</span>
              </span>
              <span className="text-[8px] font-black uppercase tracking-[0.4em] text-blue-400/80 -mt-0.5 ml-0.5">Premium Dashboard</span>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="hidden xl:flex items-center gap-1">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => navToDiscoveryClear(cat.id)}
                className={`px-6 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] transition-all duration-300 flex items-center gap-2 group/nav ${
                  category === cat.id && view === 'discovery' && searchResults === null
                    ? 'text-white bg-white/10' 
                    : 'text-gray-500 hover:text-white hover:bg-white/5'
                }`}
              >
                <span className={`transition-colors duration-300 ${category === cat.id && view === 'discovery' && searchResults === null ? 'text-blue-400' : 'group-hover/nav:text-blue-400'}`}>
                  {cat.icon}
                </span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-8">
          <form onSubmit={handleSearch} className="hidden md:flex items-center relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-400 transition-colors" />
            <input 
              type="text" 
              placeholder="Search library..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white/5 border border-white/5 rounded-2xl pl-11 pr-4 py-2.5 text-[10px] w-64 focus:outline-none focus:border-blue-500/30 focus:bg-white/10 transition-all font-bold uppercase tracking-widest placeholder:text-gray-600 shadow-inner"
            />
          </form>
          
          <div className="flex items-center gap-2 border-l border-white/10 pl-8">
            <NavIcon icon={<Bell />} count="2" />
            <NavIcon icon={<Settings />} />
            <div className="ml-4 flex items-center gap-4 group cursor-pointer">
              <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-[10px] font-bold uppercase tracking-widest">Admin</span>
                <span className="text-[8px] font-bold text-blue-500 uppercase tracking-widest opacity-60">Professional</span>
              </div>
              <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 p-0.5 flex items-center justify-center group-hover:border-blue-500/40 transition-all duration-500">
                  <div className="w-full h-full rounded-[14px] bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                    <User className="w-5 h-5 text-gray-400" />
                  </div>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Content Area */}
      <main className="pt-32 pb-24 px-10 max-w-[1920px] mx-auto min-h-screen">
        {view === 'discovery' ? (
          <div className="space-y-16 animate-cinema-fade">
            {/* Header with high visual impact */}
            <div className="relative">
              <div className="flex items-center gap-6">
                <div className="w-1.5 h-12 bg-blue-600 rounded-full shadow-[0_0_25px_rgba(37,99,235,0.7)]" />
                <div className="space-y-1">
                  <h1 className="text-5xl md:text-6xl font-black italic uppercase tracking-tighter text-gradient leading-tight font-outfit pr-4">
                    {CATEGORIES.find(c => c.id === category)?.label}
                  </h1>
                  <p className="text-[10px] font-bold uppercase tracking-[0.5em] text-gray-500 flex items-center gap-2">
                    <span className="w-1 h-1 rounded-full bg-blue-500/50" />
                    Exploring Content / {category.replace(/-/g, ' ')}
                  </p>
                </div>
              </div>
            </div>
            
            {searchResults ? (
               <div className="space-y-6">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <h2 className="text-xl font-black uppercase italic tracking-tighter text-blue-400">Search Results</h2>
                   <div className="flex items-center gap-6">
                       <div className="flex items-center bg-white/5 p-1 rounded-xl">
                           <button onClick={() => setSearchSource('all')} className={`px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-colors ${searchSource === 'all' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>Combined</button>
                           <button onClick={() => setSearchSource('kkphim')} className={`px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-colors ${searchSource === 'kkphim' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>KKPhim Streams</button>
                           <button onClick={() => setSearchSource('tmdb')} className={`px-4 py-1.5 rounded-lg text-[9px] font-bold uppercase transition-colors ${searchSource === 'tmdb' ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}>TMDB Database</button>
                       </div>
                       <button onClick={() => { setSearchResults(null); setSearchQuery(''); setSearchSource('all'); }} className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors">Clear</button>
                   </div>
                 </div>
                 {searchResults.filter(item => searchSource === 'all' || item.source === searchSource).length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-20 opacity-50">
                       <Search className="w-10 h-10 mb-4" />
                       <div className="text-xs font-bold uppercase tracking-widest">No matching records found in this source</div>
                    </div>
                 ) : (
                    <DiscoveryGrid 
                        staticItems={searchSource === 'all' ? searchResults : searchResults.filter(item => item.source === searchSource)} 
                        onMovieClick={handleMovieClick} 
                    />
                 )}
               </div>
            ) : (
               <DiscoveryGrid category={category} onMovieClick={handleMovieClick} />
            )}
          </div>
        ) : (
          slug && <MovieDetail slug={slug} onBack={navToDiscoveryClear} />
        )}
      </main>

      {/* Minimal System Footer */}
      <footer className="border-t border-white/5 py-16 px-10 bg-black/40">
        <div className="max-w-[1920px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-12 items-center">
           <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-blue-600/20 flex items-center justify-center border border-blue-500/20">
                  <Play className="w-3 h-3 text-blue-500 fill-blue-500" />
                </div>
                <span className="font-black italic text-xl tracking-tighter uppercase font-outfit">Cinema<span className="text-blue-500">Pro</span></span>
              </div>
              <p className="text-[10px] font-medium text-gray-600 uppercase tracking-widest max-w-xs leading-relaxed">
                Autonomous media discovery and j-downloader management system. Engineered for high-speed content acquisition.
              </p>
           </div>
           
           <div className="flex justify-center gap-16">
              <FooterMetric label="Uptime" value="99.99%" color="text-green-500" />
              <FooterMetric label="Node" value="OMV-SVR-01" />
              <FooterMetric label="Cache" value="Warm / 2.7GB" />
           </div>

           <div className="flex justify-end gap-1 px-1">
              {['About', 'System', 'Privacy', 'Legal'].map(l => (
                <button key={l} className="px-4 py-2 rounded-lg text-[9px] font-black uppercase tracking-[0.2em] text-gray-600 hover:text-white transition-colors">
                  {l}
                </button>
              ))}
           </div>
        </div>
      </footer>
    </div>
  );
}

function NavIcon({ icon, count }: { icon: any, count?: string }) {
  return (
    <button className="relative p-3 rounded-xl hover:bg-white/5 text-gray-500 hover:text-white transition-all group">
      {icon}
      {count && (
        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-blue-600 text-[8px] font-black flex items-center justify-center text-white border-2 border-[#050505] shadow-lg group-hover:scale-110 transition-transform">
          {count}
        </span>
      )}
    </button>
  );
}

function FooterMetric({ label, value, color = "text-gray-400" }: { label: string, value: string, color?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-700">{label}</span>
      <span className={`text-xs font-black uppercase tracking-widest ${color}`}>{value}</span>
    </div>
  );
}

export default App;
