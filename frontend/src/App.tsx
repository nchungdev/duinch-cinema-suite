import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from './api/config';
import { DiscoveryGrid } from './components/DiscoveryGrid';
import { MovieDetail } from './components/MovieDetail';
import { Search, Play, Settings, Bell, Compass, Film, Tv, Monitor as MonitorIcon, Clapperboard, User, Loader2 } from 'lucide-react';

type SearchTab = 'all' | 'movie' | 'tv';
const SEARCH_TABS: { id: SearchTab; label: string }[] = [
  { id: 'all',   label: 'All'    },
  { id: 'movie', label: 'Movies' },
  { id: 'tv',    label: 'TV'     },
];

const CATEGORIES = [
  { id: 'new', label: 'Recommended', icon: <Compass className="w-4 h-4" /> },
  { id: 'phim-le', label: 'Movies', icon: <Film className="w-4 h-4" /> },
  { id: 'phim-bo', label: 'Series', icon: <Tv className="w-4 h-4" /> },
  { id: 'hoat-hinh', label: 'Animation', icon: <MonitorIcon className="w-4 h-4" /> },
  { id: 'phim-chieu-rap', label: 'Theatre', icon: <Clapperboard className="w-4 h-4" /> },
];

function App() {
  const [slug, setSlug] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<string>('movie');
  const [view, setView] = useState<'discovery' | 'detail'>('discovery');
  const [category, setCategory] = useState('new');
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery,   setSearchQuery]   = useState('');
  const [searchActive,  setSearchActive]  = useState(false);   // are we in search mode?
  const [searchTab,     setSearchTab]     = useState<SearchTab>('all');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchPage,    setSearchPage]    = useState(1);
  const [searchTotal,   setSearchTotal]   = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [showRecent,     setShowRecent]    = useState(false);
  const [urlParams,     setUrlParams]     = useState<{ s?: number, e?: number, q?: string }>({});

  const lastSearchQuery = useRef<string | null>(null);
  const sentinelRef     = useRef<HTMLDivElement>(null);

  // --- SYNC MANAGER ---
  const performSync = useCallback(async () => {
    try {
      const progress = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
      const history  = JSON.parse(localStorage.getItem('omv_watch_history') || '{}');
      
      const res = await api.post<any>('/user/sync', { progress, history });
      const data = res.data;

      // Update local with merged data from server
      if (data?.progress) localStorage.setItem('omv_watch_progress', JSON.stringify(data.progress));
      if (data?.history)  localStorage.setItem('omv_watch_history', JSON.stringify(data.history));
      
      console.log('[Sync] Background synchronization complete');
    } catch (err) {
      console.error('[Sync] Background sync failed:', err);
    }
  }, []);

  // Sync on Mount + Periodic (15 mins)
  useEffect(() => {
    performSync(); // Initial sync
    const interval = setInterval(performSync, 15 * 60 * 1000); // 15 mins
    return () => clearInterval(interval);
  }, [performSync]);
  // --------------------

  // Load recent searches on mount

  const saveSearch = (q: string) => {
    if (!q.trim()) return;
    const updated = [q, ...recentSearches.filter(s => s !== q)].slice(0, 10);
    setRecentSearches(updated);
    localStorage.setItem('recent_searches', JSON.stringify(updated));
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    saveSearch(searchQuery);
    setShowRecent(false);
    window.location.hash = `#/search?q=${encodeURIComponent(searchQuery)}`;
  };

  const executeSearch = useCallback(async (q: string, tab: SearchTab = 'all', page: number = 1, background = false) => {
    if (page === 1) {
      setSearchResults([]);
      setSearchPage(1);
      if (!background) window.scrollTo({ top: 0, behavior: 'instant' });
    }
    setSearchLoading(true);
    try {
      const res = await api.get<{ results: any[]; total_pages: number; page: number }>(
        `/search?q=${encodeURIComponent(q)}&media_type=${tab}&page=${page}`
      );
      const data = res.data;
      setSearchResults(prev => page === 1 ? (data?.results || []) : [...prev, ...(data?.results || [])]);
      setSearchTotal(data?.total_pages || 1);
      setSearchPage(page);
      setSearchQuery(q);
      lastSearchQuery.current = q;
      setSearchActive(true);
      // background = true: chỉ populate results (dùng khi refresh từ detail page),
      // không navigate ra khỏi detail view
      if (!background) {
        setView('discovery');
        setSlug(null);
      }
    } catch (err) {
      console.error('Search failed:', err);
      if (page === 1) setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // MASTER ROUTING: /:category/:type/:slug
  useEffect(() => {
    const handleUrlSync = () => {
      const hash = window.location.hash || '#/new';
      const [fullPath, queryPart] = hash.split('?');
      const params = new URLSearchParams(queryPart || '');
      
      const s = params.get('s') ? parseInt(params.get('s')!) : undefined;
      const e = params.get('e') ? parseInt(params.get('e')!) : undefined;
      const q = params.get('q') || undefined;
      setUrlParams({ s, e, q });

      const parts = fullPath.split('/').filter(p => p && p !== '#'); // [":category", ":type", ":slug"]
      
      if (parts.length >= 3) {
        // Detail Path: #/new/tv/76479 or #/search/movie/123
        const cat = parts[0];
        const type = parts[1];
        const id = parts[2];
        
        setCategory(cat);
        setMediaType(type);
        setSlug(id);
        setView('detail');
        
        if (cat === 'search' && q && !searchActive) {
            // background=true: khôi phục search results mà không navigate ra khỏi detail view
            executeSearch(q, 'all', 1, true);
        }
      } else if (parts.length >= 1) {
        const cat = parts[0];
        setCategory(cat);
        setView('discovery');
        setSlug(null);

        if (cat === 'search') {
            setSearchActive(true);
            if (q && lastSearchQuery.current !== q) executeSearch(q, 'all', 1);
        } else {
            setSearchActive(false);
            setSearchResults([]);
            setSearchTab('all');
            lastSearchQuery.current = null;
            if (!searchQuery) setSearchQuery('');
        }
      } else {
        window.location.hash = '#/new';
      }
    };

    window.addEventListener('popstate', handleUrlSync);
    window.addEventListener('hashchange', handleUrlSync);
    handleUrlSync();
    return () => {
      window.removeEventListener('popstate', handleUrlSync);
      window.removeEventListener('hashchange', handleUrlSync);
    };
  }, [searchActive, executeSearch]);

  const handleMovieClick = (clickedSlug: string, mType: string = 'movie') => {
    const currentCat = searchActive ? 'search' : category;
    const qParam = urlParams.q ? `?q=${encodeURIComponent(urlParams.q)}` : '';
    window.location.hash = `#/${currentCat}/${mType}/${clickedSlug}${qParam}`;
  };

  // Infinite scroll sentinel
  useEffect(() => {
    if (!searchActive || !sentinelRef.current) return;
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && !searchLoading && searchPage < searchTotal) {
        executeSearch(lastSearchQuery.current!, searchTab, searchPage + 1);
      }
    }, { threshold: 0.1 });
    obs.observe(sentinelRef.current);
    return () => obs.disconnect();
  }, [searchActive, searchLoading, searchPage, searchTotal, searchTab, executeSearch]);

  // Tab switch — re-run search with new tab
  const handleSearchTabChange = (tab: SearchTab) => {
    setSearchTab(tab);
    if (lastSearchQuery.current) executeSearch(lastSearchQuery.current, tab, 1);
  };

  const navToDiscoveryClear = (newCat?: string) => {
    const targetCat = newCat || category;
    window.location.hash = `#/${targetCat}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-500/40 font-inter antialiased">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-600/5 blur-[120px] rounded-full" />
      </div>

      <nav className={`fixed top-0 left-0 right-0 z-[100] h-20 px-10 flex items-center justify-between transition-all duration-500 border-b ${
        scrolled || view === 'detail' ? 'bg-black/80 backdrop-blur-2xl border-white/10' : 'bg-transparent border-transparent'
      }`}>
        <div className="flex items-center gap-16">
          <div onClick={() => navToDiscoveryClear('new')} className="flex items-center gap-3 cursor-pointer group">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] group-hover:scale-110 transition-transform duration-500">
               <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <div className="flex flex-col">
               <span className="text-lg font-black tracking-tighter uppercase italic leading-none">JD DASH</span>
               <span className="text-[8px] font-bold tracking-[0.3em] text-blue-500 uppercase">OMV Protocol</span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-8">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navToDiscoveryClear(cat.id)}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl transition-all duration-300 group ${
                  category === cat.id && !searchResults && view === 'discovery'
                    ? 'bg-white/10 text-white' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <div className={`transition-colors ${category === cat.id ? 'text-blue-500' : 'group-hover:text-blue-400'}`}>
                  {cat.icon}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-8">
           <div className="relative hidden md:block group">
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  type="text"
                  placeholder="Lookup Metadata..."
                  value={searchQuery}
                  onFocus={() => setShowRecent(true)}
                  onBlur={() => setTimeout(() => setShowRecent(false), 200)}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-12 pr-4 text-[10px] font-bold uppercase tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:bg-white/10 transition-all"
                />
              </form>

              {/* Recent Searches Dropdown */}
              {showRecent && recentSearches.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-black/90 backdrop-blur-2xl border border-white/10 rounded-2xl overflow-hidden shadow-2xl z-[200] animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="p-4 border-b border-white/5 flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">Recent Searches</span>
                    <button 
                      onClick={() => { setRecentSearches([]); localStorage.removeItem('recent_searches'); }}
                      className="text-[8px] font-black uppercase tracking-widest text-blue-500 hover:text-blue-400"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {recentSearches.map((s, idx) => (
                      <div 
                        key={idx}
                        onClick={() => {
                          setSearchQuery(s);
                          window.location.hash = `#/search?q=${encodeURIComponent(s)}`;
                          setShowRecent(false);
                        }}
                        className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 cursor-pointer transition-colors group/item"
                      >
                        <Search className="w-3 h-3 text-gray-600 group-hover/item:text-blue-500" />
                        <span className="text-[10px] font-bold text-gray-300 group-hover/item:text-white truncate">{s}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
           </div>
           <div className="flex items-center gap-4">
              <ToolIcon icon={<Bell className="w-4 h-4" />} />
              <ToolIcon icon={<Settings className="w-4 h-4" />} />
              <div className="w-px h-6 bg-white/10 mx-2" />
              <div className="flex items-center gap-3 pl-2 cursor-pointer group">
                  <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black uppercase tracking-tighter leading-none">Admin Node</span>
                      <span className="text-[8px] font-bold text-green-500 uppercase tracking-widest">Active</span>
                  </div>
                  <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center group-hover:border-blue-500/50 transition-all">
                      <User className="w-5 h-5 text-gray-400" />
                  </div>
              </div>
           </div>
        </div>
      </nav>

      <main className="pt-32 pb-20 px-10">
         {view === 'discovery' ? (
            <div className="max-w-screen-2xl mx-auto space-y-12">
            {searchActive ? (
               <div className="space-y-6">
                 {/* Header row */}
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                   <div className="flex items-center gap-6">
                     <h2 className="text-xl font-black uppercase italic tracking-tighter text-blue-400">
                       "{lastSearchQuery.current}"
                     </h2>
                   </div>
                   <button onClick={() => { setSearchActive(false); setSearchResults([]); setSearchTab('all'); lastSearchQuery.current = null; setSearchQuery(''); window.location.hash = `#/${category}`; }}
                     className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-white transition-colors self-start md:self-auto">
                     ✕ Clear
                   </button>
                 </div>

                 {/* Tabs: All / Movies / TV */}
                 <div className="flex items-center gap-1 border-b border-white/5 pb-0">
                   {SEARCH_TABS.map(tab => (
                     <button key={tab.id} onClick={() => handleSearchTabChange(tab.id)}
                       className={`px-5 py-2.5 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all -mb-px ${
                         searchTab === tab.id
                           ? 'text-blue-400 border-blue-500'
                           : 'text-gray-600 border-transparent hover:text-gray-300 hover:border-white/20'
                       }`}>
                       {tab.label}
                     </button>
                   ))}
                 </div>

                 {/* Results */}
                 {searchLoading && searchResults.length === 0 ? (
                   <div className="flex items-center justify-center py-20 gap-3 text-gray-600">
                     <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Searching…</span>
                   </div>
                 ) : searchResults.length === 0 ? (
                   <div className="flex flex-col items-center justify-center p-20 opacity-50">
                     <Search className="w-10 h-10 mb-4" />
                     <div className="text-xs font-bold uppercase tracking-widest">No results found</div>
                   </div>
                 ) : (
                   <>
                     <DiscoveryGrid staticItems={searchResults} onMovieClick={handleMovieClick} />
                     {/* Infinite scroll sentinel */}
                     <div ref={sentinelRef} className="h-10 flex items-center justify-center">
                       {searchLoading && (
                         <div className="flex items-center gap-2 text-gray-600">
                           <Loader2 className="w-4 h-4 animate-spin text-blue-500/60" />
                           <span className="text-[9px] font-black uppercase tracking-widest">Loading more…</span>
                         </div>
                       )}
                       {!searchLoading && searchPage >= searchTotal && searchResults.length > 0 && (
                         <span className="text-[8px] font-black uppercase tracking-widest text-gray-700">End of results</span>
                       )}
                     </div>
                   </>
                 )}
               </div>
            ) : (
               <div className="space-y-8">
                   {category === 'new' && (
                       <div className="flex items-center gap-6 border-b border-white/5 pb-6">
                           <button onClick={() => setMediaType('movie')} className={`text-[10px] font-black uppercase tracking-[0.3em] transition-all ${mediaType === 'movie' ? 'text-blue-500 border-b-2 border-blue-500 pb-2' : 'text-gray-600 hover:text-gray-400'}`}>Movies</button>
                           <button onClick={() => setMediaType('tv')} className={`text-[10px] font-black uppercase tracking-[0.3em] transition-all ${mediaType === 'tv' ? 'text-blue-500 border-b-2 border-blue-500 pb-2' : 'text-gray-600 hover:text-gray-400'}`}>TV Shows</button>
                       </div>
                   )}
                   <DiscoveryGrid category={category} mediaType={mediaType as any} onMovieClick={handleMovieClick} />
               </div>
            )}
            </div>
         ) : slug ? (
            <MovieDetail 
              slug={slug} 
              mediaType={mediaType}
              category={category}
              initialSeason={urlParams.s}
              initialEpisode={urlParams.e}
              onBack={() => window.history.back()} 
            />
         ) : null}
      </main>

      <footer className="fixed bottom-0 left-0 right-0 h-12 bg-black/40 backdrop-blur-xl border-t border-white/5 px-10 flex items-center justify-between z-[90]">
         <div className="flex items-center gap-6">
            <StatPill label="API Status" value="Online" color="text-green-500" />
            <StatPill label="JD Node" value="Connected" color="text-blue-500" />
            <StatPill label="Storage" value="84% Free" color="text-yellow-500" />
         </div>
         <div className="flex items-center gap-4 text-[8px] font-black uppercase tracking-[0.3em] text-gray-600">
            <span>© 2024 OMV Unified Interface</span>
            <div className="w-1 h-1 rounded-full bg-white/10" />
            <span>v4.2.0-stable</span>
         </div>
      </footer>
    </div>
  );
}

function ToolIcon({ icon }: { icon: any }) {
  return (
    <button className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 hover:text-white hover:border-white/20 transition-all">
      {icon}
    </button>
  );
}

function StatPill({ label, value, color }: { label: string, value: string, color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[9px] font-bold uppercase tracking-widest text-gray-700">{label}</span>
      <span className={`text-xs font-black uppercase tracking-widest ${color}`}>{value}</span>
    </div>
  );
}

export default App;
