import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Play, Settings, Bell, Compass, Film, Tv, Monitor as MonitorIcon, Clapperboard, User, Loader2, ChevronDown, ChevronRight, X, ShieldCheck, PlugZap, FolderTree, Pause, Trash2, RefreshCw, Heart, Star, Calendar, Pin, HardDrive } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, getProxiedImageUrl } from '@shared/api/config';
import { DiscoveryGrid } from './presentation/components/DiscoveryGrid';
import { MediaDetail } from './presentation/components/MediaDetail';
import { useDownloaderContext, type JdTaskPackage } from './presentation/context/DownloaderContext';

type SearchTab = 'movie' | 'tv' | 'multi';

interface JdTaskLink {
  uuid: string;
  name: string;
  host?: string;
  status: string;
  bytesLoaded: number;
  bytesTotal: number;
  speed: number;
  eta: number;
  running: boolean;
  finished: boolean;
}

const CATEGORIES = [
  { id: 'trending', label: 'Trending', icon: <Compass className="w-4 h-4" /> },
  { id: 'popular', label: 'Popular', icon: <Heart className="w-4 h-4" /> },
  { id: 'top_rated', label: 'Top Rated', icon: <Star className="w-4 h-4" /> },
  { id: 'releases', label: 'New Release', icon: <Calendar className="w-4 h-4" /> },
  { id: 'animation', label: 'Animation', icon: <MonitorIcon className="w-4 h-4" /> },
];

function App() {
  const getInit = () => {
    const hash = window.location.hash || '#/trending';
    const [fullPath, queryPart] = hash.split('?');
    const params = new URLSearchParams(queryPart || '');
    const parts = fullPath.split('/').filter(p => p && p !== '#');
    const q = params.get('q') || '';
    
    if (parts.length >= 3) {
      return { view: 'detail' as const, category: parts[0], mediaType: parts[1], slug: parts[2], searchQuery: q };
    }
    return { view: 'discovery' as const, category: parts[0] || 'trending', mediaType: 'movie', slug: null, searchQuery: q };
  };

  const init = getInit();
  const [slug, setSlug] = useState<string | null>(init.slug);
  const [mediaType, setMediaType] = useState<string>(init.mediaType);
  const [view, setView] = useState<'discovery' | 'detail'>(init.view);
  const [category, setCategory] = useState(init.category);
  const [searchQuery,   setSearchQuery]   = useState(init.searchQuery);
  const [searchOverlayOpen, setSearchOverlayOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  
  const [scrolled, setScrolled] = useState(false);
  const [searchActive,  setSearchActive]  = useState(!!init.searchQuery && init.category === 'search');
  const [searchTab,     setSearchTab]     = useState<SearchTab>('movie');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [, setSearchPage] = useState(1);
  const [, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [urlParams,     setUrlParams]     = useState<{ s?: number, e?: number, q?: string }>({});

  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showTasks, setShowTasks] = useState(false);
  const [tasksCount, setTasksCount] = useState(0);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const { hasCredentials } = useDownloaderContext();

  const lastSearchQuery = useRef<string | null>(null);
  const syncLock        = useRef(false);

  // --- SUGGESTIONS ---
  useEffect(() => {
    if (!searchQuery || searchQuery.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(searchQuery)}&media_type=multi&page=1`);
        setSuggestions((res.data?.results || []).slice(0, 8));
      } catch (err) {
        console.error('Suggestions fetch failed:', err);
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [searchQuery]);

  // --- SYNC MANAGER ---
  const performSync = useCallback(async () => {
    try {
      const progress = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
      const history  = JSON.parse(localStorage.getItem('omv_watch_history') || '{}');
      await api.post<any>('/user/sync', { progress, history }).then(res => {
          if (res.data?.progress) localStorage.setItem('omv_watch_progress', JSON.stringify(res.data.progress));
          if (res.data?.history)  localStorage.setItem('omv_watch_history', JSON.stringify(res.data.history));
      });
    } catch (err) {
      console.error('[Sync] Background sync failed:', err);
    }
  }, []);

  useEffect(() => {
    if (syncLock.current) return;
    syncLock.current = true;
    performSync();
    const interval = setInterval(performSync, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [performSync]);

  const executeSearch = useCallback(async (q: string, tab: SearchTab = 'movie', page: number = 1, background = false) => {
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
      setSearchResults(prev => page === 1 ? (res.data?.results || []) : [...prev, ...(res.data?.results || [])]);
      setSearchTotal(res.data?.total_pages || 1);
      setSearchPage(page);
      setSearchQuery(q);
      lastSearchQuery.current = q;
      setSearchActive(true);
      if (!background) { setView('discovery'); setSlug(null); }
    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close account menu on click outside
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    if (showAccountMenu) window.addEventListener('mousedown', handle);
    return () => window.removeEventListener('mousedown', handle);
  }, [showAccountMenu]);

  useEffect(() => {
    const handleUrlSync = () => {
      const hash = window.location.hash || '#/trending';
      const [fullPath, queryPart] = hash.split('?');
      const params = new URLSearchParams(queryPart || '');
      
      const s = params.get('s') ? parseInt(params.get('s')!) : undefined;
      const e = params.get('e') ? parseInt(params.get('e')!) : undefined;
      const q = params.get('q') || undefined;
      const mtParam = params.get('media_type') as SearchTab | null;
      setUrlParams({ s, e, q });

      let parts = fullPath.split('/').filter(p => p && p !== '#');
      
      // Legacy slug mapping
      const slugMap: Record<string, string> = {
        'new': 'trending',
        'phim-le': 'movies',
        'phim-bo': 'series',
        'hoat-hinh': 'animation',
        'phim-chieu-rap': 'theatre'
      };
      
      if (parts.length > 0 && slugMap[parts[0]]) {
        parts[0] = slugMap[parts[0]];
        const newHash = `#/${parts.join('/')}${queryPart ? '?' + queryPart : ''}`;
        window.location.hash = newHash;
        return; // handleUrlSync will be called again by hashchange
      }

      if (parts.length >= 3) {
        setCategory(parts[0]);
        setMediaType(parts[1]);
        setSlug(parts[2]);
        setView('detail');
      } else {
        setView('discovery');
        setSlug(null);
        setCategory(parts[0] || 'trending');
        if (q && q !== lastSearchQuery.current) {
            executeSearch(q, mtParam || searchTab, 1);
        } else if (!q) {
            setSearchActive(false);
            setSearchQuery('');
            setSearchTab('movie');
            lastSearchQuery.current = null;
        }
      }
    };

    handleUrlSync();
    window.addEventListener('hashchange', handleUrlSync);
    return () => window.removeEventListener('hashchange', handleUrlSync);
  }, [searchActive, executeSearch, searchTab]);

  const handleMovieClick = (clickedSlug: string, mType: string = 'movie') => {
    const currentCat = searchActive ? 'search' : category;
    const qParam = urlParams.q ? `?q=${encodeURIComponent(urlParams.q)}` : '';
    window.location.hash = `#/${currentCat}/${mType}/${clickedSlug}${qParam}`;
  };

  const navToDiscoveryClear = (newCat?: string) => {
    const targetCat = newCat || category;
    window.location.hash = `#/${targetCat}`;
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-blue-500/40 font-inter antialiased">
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes wave {
          0%, 100% { height: 30%; }
          50% { height: 100%; }
        }
      `}} />
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[600px] h-[600px] bg-purple-600/5 blur-[120px] rounded-full" />
      </div>

      <nav className={`fixed top-0 left-0 right-0 z-[100] h-20 px-10 flex items-center justify-between transition-all duration-500 border-b ${
        scrolled || view === 'detail' ? 'bg-black/80 backdrop-blur-2xl border-white/10' : 'bg-transparent border-transparent'
      }`}>
        <div className="flex items-center gap-16">
          <div onClick={() => navToDiscoveryClear('trending')} className="flex items-center gap-3 cursor-pointer group">
            <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.4)] group-hover:scale-110 transition-transform duration-500">
               <Play className="w-5 h-5 text-white fill-white" />
            </div>
            <div className="flex flex-col">
               <span className="text-xl font-black tracking-tighter uppercase italic leading-none">DUINCH</span>
               <span className="text-[10px] font-bold tracking-[0.2em] text-blue-500 uppercase mt-0.5">Cinema Suite</span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-8">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => navToDiscoveryClear(cat.id)}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-xl transition-all duration-300 group ${
                  category === cat.id && !searchActive && view === 'discovery'
                    ? 'bg-white/10 text-white' 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <div className={`transition-colors ${category === cat.id && !searchActive ? 'text-blue-500' : 'group-hover:text-blue-400'}`}>
                  {cat.icon}
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest whitespace-nowrap">{cat.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-8">
           <div className="flex items-center gap-3">
              <ToolIcon 
                onClick={() => setSearchOverlayOpen(true)}
                icon={<Search className="w-4 h-4" />} 
              />
              <ToolIcon icon={<Bell className="w-4 h-4" />} />
              <div className="w-px h-5 bg-white/10 mx-1" />

              {/* Account / Profile Section */}
              <div className="relative" ref={accountMenuRef}>
                <button
                  onClick={() => setShowAccountMenu(!showAccountMenu)}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-2xl border transition-all cursor-pointer ${
                    showAccountMenu
                      ? 'bg-blue-500/10 border-blue-500/40 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                      : 'bg-white/[0.04] border-white/8 hover:bg-white/[0.07] hover:border-white/15'
                  }`}
                >
                  <div className="relative shrink-0">
                    <div className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all ${showAccountMenu ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-white/10'}`}>
                      <User className={`w-3.5 h-3.5 ${showAccountMenu ? 'text-white' : 'text-gray-400'}`} />
                    </div>
                    <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 border border-[#0a0a0c]" />
                  </div>
                  <div className="hidden sm:flex flex-col items-start leading-none">
                    <span className="text-[10px] font-black text-white tracking-tight">Admin</span>
                    <span className="text-[8px] font-bold text-green-400 tracking-widest uppercase mt-0.5">Active</span>
                  </div>
                  <ChevronDown className={`w-3 h-3 text-gray-500 transition-transform hidden sm:block ${showAccountMenu ? 'rotate-180' : ''}`} />
                </button>

                {/* Account Dropdown Menu */}
                {showAccountMenu && (
                  <div className="absolute top-full right-0 mt-3 w-80 bg-[#0a0a0c]/98 backdrop-blur-3xl border border-white/8 rounded-3xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] z-[110] animate-cinema-fade overflow-hidden">
                    <div className="p-6 space-y-8">
                       
                       {/* Section: JDownloader (Nodes, Tasks & Config) */}
                       <div className="space-y-4">
                         <p className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-600 ml-1">JDownloader Control</p>
                         
                         <DeviceSelector insideMenu={true} />
                         
                         <button
                           onClick={() => { setShowAccountMenu(false); setShowSettings(true); }}
                           className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-blue-600/10 hover:border-blue-500/30 transition-all group/btn text-left"
                         >
                           <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover/btn:bg-blue-500/15 group-hover/btn:border-blue-500/20 transition-all shrink-0">
                             <Settings className="w-3.5 h-3.5 text-gray-500 group-hover/btn:text-blue-400 transition-colors" />
                           </div>
                           <div className="min-w-0 flex-1">
                             <p className="text-[11px] font-bold text-gray-300 group-hover/btn:text-white transition-colors">Account Config</p>
                             <p className="text-[9px] text-gray-600">JDownloader & cloud settings</p>
                           </div>
                           <ChevronRight className="w-3 h-3 text-gray-700 group-hover/btn:text-gray-400 transition-colors" />
                         </button>

                         {hasCredentials && (
                           <button
                             onClick={() => { setShowAccountMenu(false); setShowTasks(true); }}
                             className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-blue-600/10 hover:border-blue-500/30 transition-all group/btn"
                           >
                             <div className="flex items-center gap-3">
                               <div className="w-8 h-8 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover/btn:bg-blue-500/15 group-hover/btn:border-blue-500/20 transition-all shrink-0">
                                 <FolderTree className="w-3.5 h-3.5 text-gray-500 group-hover/btn:text-blue-400 transition-colors" />
                               </div>
                               <div className="min-w-0 flex-1">
                                 <p className="text-[11px] font-bold text-gray-300 group-hover/btn:text-white transition-colors">Active Queue</p>
                               </div>
                             </div>
                             {tasksCount > 0 && (
                               <span className="bg-blue-600 px-1.5 py-0.5 rounded text-[8px] font-black text-white shadow-[0_0_10px_rgba(37,99,235,0.4)]">{tasksCount}</span>
                             )}
                             <ChevronRight className="w-3 h-3 text-gray-700 group-hover/btn:text-gray-400 transition-colors ml-2" />
                           </button>
                         )}
                       </div>

                       {/* Section: System & Storage */}
                       <div className="space-y-4">
                         <p className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-600 ml-1">System Health</p>
                         <div className="flex items-center justify-between px-3 py-3 rounded-xl bg-white/[0.02] border border-white/5">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                                <HardDrive className="w-3.5 h-3.5 text-yellow-500" />
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Suite Health</span>
                                <span className="text-[10px] font-black text-white uppercase tracking-wider">84% Capacity Free</span>
                              </div>
                            </div>
                            <span className="text-[7px] font-mono text-gray-700">v4.2.0-stable</span>
                         </div>
                       </div>
                    </div>
                  </div>
                )}
              </div>
           </div>
        </div>
      </nav>

      {/* Full-screen Search Overlay */}
      <AnimatePresence>
        {searchOverlayOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-[#050505]/95 backdrop-blur-3xl flex flex-col items-center pt-32 px-6"
          >
            <button 
              onClick={() => setSearchOverlayOpen(false)}
              className="absolute top-10 right-10 w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-400 hover:text-white transition-all group"
            >
              <X className="w-6 h-6 group-hover:scale-110 transition-transform" />
            </button>

            <div className="w-full max-w-3xl space-y-8">
              <div className="relative group">
                <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-6 h-6 text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                <input 
                  autoFocus
                  type="text"
                  placeholder="Type to search cinema metadata..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      setSearchOverlayOpen(false);
                      window.location.hash = `#/search?q=${encodeURIComponent(searchQuery)}&media_type=multi`;
                    }
                  }}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-[2rem] py-6 pl-16 pr-8 text-xl font-black uppercase tracking-widest outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all placeholder:text-gray-700"
                />
              </div>

              {/* Real-time Suggestions */}
              {suggestions.length > 0 && (
                <div className="grid grid-cols-1 gap-2 animate-in slide-in-from-top-4 duration-500">
                  <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-600 mb-2 ml-4">Quick Results</p>
                  {suggestions.map((item) => (
                    <button
                      key={item.slug}
                      onClick={() => {
                        setSearchOverlayOpen(false);
                        handleMovieClick(item.slug, item.media_type);
                      }}
                      className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-blue-600/10 hover:border-blue-500/30 transition-all group/sugg"
                    >
                      <div className="w-10 h-14 rounded-lg overflow-hidden border border-white/10 shrink-0">
                        <img src={item.poster} className="w-full h-full object-cover" alt="" />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-xs font-black uppercase tracking-wider text-white group-hover/sugg:text-blue-400 transition-colors">{item.title}</p>
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">{item.year} • {item.media_type}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-700 group-hover/sugg:text-blue-500 transition-all" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="pt-32 pb-10 px-10">
         {view === 'discovery' ? (
            <div className="max-w-screen-2xl mx-auto space-y-12">
            {searchActive ? (
               <div className="space-y-6">
                 <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
                   <div className="flex items-center gap-6">
                     <h2 className="text-xl font-black uppercase italic tracking-tighter text-blue-400">
                       "{lastSearchQuery.current || searchQuery}"
                     </h2>
                   </div>
                   <div className="flex items-center gap-4">
                     {(['movie', 'tv'] as const).map((tab) => (
                       <button
                         key={tab}
                         onClick={() => {
                           setSearchTab(tab);
                           executeSearch(searchQuery, tab, 1);
                         }}
                         className={`text-[10px] font-black uppercase tracking-[0.2em] px-4 py-2 rounded-lg transition-all ${
                           searchTab === tab 
                             ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]' 
                             : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
                         }`}
                       >
                         {tab === 'movie' ? 'Movies' : 'TV Shows'}
                       </button>
                     ))}
                   </div>
                 </div>

                 {searchLoading && searchResults.length === 0 ? (
                   <div className="flex items-center justify-center py-20 gap-3 text-gray-600">
                     <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
                     <span className="text-[10px] font-black uppercase tracking-widest">Searching…</span>
                   </div>
                 ) : (
                   <DiscoveryGrid 
                     category="search" 
                     mediaType={searchTab} 
                     searchQuery={lastSearchQuery.current || searchQuery}
                     onItemClick={(item) => handleMovieClick(item.slug, item.media_type)} 
                   />
                 )}
                 </div>
                 ) : (
                 <div className="space-y-8">
                 {CATEGORIES.some(c => c.id === category) && (
                     <div className="flex items-center gap-6 border-b border-white/5 pb-6">
                         <button onClick={() => setMediaType('movie')} className={`text-[10px] font-black uppercase tracking-[0.3em] transition-all ${mediaType === 'movie' ? 'text-blue-500 border-b-2 border-blue-500 pb-2' : 'text-gray-600 hover:text-gray-400'}`}>Movies</button>
                         <button onClick={() => setMediaType('tv')} className={`text-[10px] font-black uppercase tracking-[0.3em] transition-all ${mediaType === 'tv' ? 'text-blue-500 border-b-2 border-blue-500 pb-2' : 'text-gray-600 hover:text-gray-400'}`}>TV Shows</button>
                     </div>
                 )}
                 <DiscoveryGrid 
                   category={category} 
                   mediaType={mediaType as any} 
                   onItemClick={(item) => handleMovieClick(item.slug, item.media_type)} 
                 />
                 </div>
                 )}
            </div>
         ) : slug ? (
            <MediaDetail 
              key={slug}
              slug={slug} 
              mediaType={mediaType}
              category={category}
              initialSeason={urlParams.s}
              initialEpisode={urlParams.e}
              onBack={() => window.history.back()} 
            />
         ) : null}
      </main>

      <JDownloaderModals 
        showSettings={showSettings} 
        setShowSettings={setShowSettings}
        showTasks={showTasks}
        setShowTasks={setShowTasks}
        setTasksCount={setTasksCount}
      />
    </div>
  );
}

function JDownloaderModals({ 
  showSettings, 
  setShowSettings,
  showTasks,
  setShowTasks,
  setTasksCount
}: { 
  showSettings: boolean; 
  setShowSettings: (v: boolean) => void;
  showTasks: boolean;
  setShowTasks: (v: boolean) => void;
  setTasksCount: (v: number) => void;
}) {
  const { isJdOnline, isChecking, status, devices, activeDevice, accountEmail, hasCredentials, setActiveDevice, refreshStatus, updateConfig, logout } = useDownloaderContext();
  const [showConnectForm, setShowConnectForm] = useState(false);
  const [tasks, setTasks] = useState<any[]>([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [expandedPackages, setExpandedPackages] = useState<Record<string, boolean>>({});
  const [activeActionKey, setActiveActionKey] = useState<string | null>(null);

  const loadTasks = useCallback(async (background = false) => {
    if (!hasCredentials) {
      setTasks([]);
      setTasksCount(0);
      return;
    }

    if (!background) setLoadingTasks(true);
    setTasksError(null);
    try {
      const query = activeDevice ? `?device=${encodeURIComponent(activeDevice)}` : '';
      const res = await api.get<any[]>(`/downloader/list${query}`);
      const nextTasks = Array.isArray(res.data) ? res.data : [];
      setTasks(nextTasks);
      setTasksCount(nextTasks.length);
      setExpandedPackages((prev) => {
        const next = { ...prev };
        nextTasks.forEach((pkg) => {
          if ((pkg.links || []).length <= 1) delete next[pkg.uuid];
        });
        return next;
      });
    } catch (err: any) {
      setTasksError(err?.message || 'Unable to load JDownloader tasks.');
    } finally {
      if (!background) setLoadingTasks(false);
    }
  }, [activeDevice, hasCredentials, setTasksCount]);

  useEffect(() => {
    if (!showTasks || !hasCredentials) return;
    loadTasks();
    const interval = setInterval(() => {
      void loadTasks(true);
    }, 8000);
    return () => clearInterval(interval);
  }, [showTasks, hasCredentials, loadTasks]);

  const runTaskAction = useCallback(async (action: 'START' | 'STOP_JOB' | 'REMOVE_JOB', ids: string[], kind: 'package' | 'link', key: string) => {
    setActiveActionKey(key);
    setTasksError(null);
    try {
      const query = activeDevice ? `?action=${action}&device=${encodeURIComponent(activeDevice)}` : `?action=${action}`;
      await api.post(`/downloader/control${query}`, { ids, kind });
      await loadTasks(true);
    } catch (err: any) {
      setTasksError(err?.message || 'Task action failed.');
    } finally {
      setActiveActionKey(null);
    }
  }, [activeDevice, loadTasks]);

  return (
    <>
      {showConnectForm && (
        <JDownloaderConnectPanel
          isChecking={isChecking}
          status={status as any}
          onClose={() => setShowConnectForm(false)}
          onRefresh={refreshStatus}
          onSave={updateConfig}
          onSuccess={() => {
            setShowConnectForm(false);
            setShowSettings(false);
          }}
        />
      )}

      {hasCredentials && showTasks && (
        <JDownloaderTaskPanel
          tasks={tasks}
          loading={loadingTasks}
          error={tasksError}
          activeDevice={activeDevice}
          accountEmail={accountEmail}
          expandedPackages={expandedPackages}
          activeActionKey={activeActionKey}
          onClose={() => setShowTasks(false)}
          onRefresh={() => void loadTasks()}
          onTogglePackage={(uuid) => setExpandedPackages((prev) => ({ ...prev, [uuid]: !prev[uuid] }))}
          onPackageAction={(action, task) => void runTaskAction(action, [task.uuid], 'package', `${action}:package:${task.uuid}`)}
          onLinkAction={(action, link) => void runTaskAction(action, [link.uuid], 'link', `${action}:link:${link.uuid}`)}
        />
      )}

      <JDownloaderSettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        status={status as any}
        accountEmail={accountEmail}
        hasCredentials={hasCredentials}
        activeDevice={activeDevice}
        isJdOnline={isJdOnline}
        isChecking={isChecking}
        onRefresh={refreshStatus}
        onSave={updateConfig}
        onLogout={logout}
      />
    </>
  );
}

function ToolIcon({ icon, onClick }: { icon: any, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 hover:text-white hover:border-white/20 transition-all"
    >
      {icon}
    </button>
  );
}

function DeviceSelector({ insideMenu = false }: { insideMenu?: boolean }) {
  const { isJdOnline, isChecking, devices, activeDevice, setActiveDevice } = useDownloaderContext();
  const [showList, setShowList] = useState(false);

  if (!insideMenu) return null;

  const statusColor = isChecking ? 'bg-yellow-500' : isJdOnline ? 'bg-green-500' : 'bg-red-500';
  const statusLabel = isChecking ? 'Checking…' : isJdOnline ? (activeDevice || 'Connected') : 'Offline';
  
  return (
    <div className="space-y-2">
      <button
        onClick={() => devices.length > 0 && setShowList(v => !v)}
        className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] transition-all group"
      >
        <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor} shadow-[0_0_6px_currentColor]`} />
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[10px] font-bold text-gray-300 truncate">{statusLabel}</p>
          <p className="text-[8px] text-gray-600 uppercase tracking-widest">JDownloader Node</p>
        </div>
        {devices.length > 0 && (
          <ChevronDown className={`w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 transition-all shrink-0 ${showList ? 'rotate-180' : ''}`} />
        )}
      </button>

      {showList && devices.length > 0 && (
        <div className="rounded-xl border border-white/5 overflow-hidden divide-y divide-white/5">
          {devices.map((d: any) => {
            const isActive = activeDevice === d.name;
            const online   = d.status === 'ONLINE';
            return (
              <button
                key={d.name}
                onClick={() => { setActiveDevice(d.name); setShowList(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all ${isActive ? 'bg-blue-600/10' : 'hover:bg-white/5'}`}
              >
                <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${online ? 'bg-green-500' : 'bg-gray-700'}`} />
                <span className={`text-[9px] font-bold uppercase tracking-widest flex-1 truncate ${isActive ? 'text-blue-400' : 'text-gray-500'}`}>{d.name}</span>
                {isActive && <div className="w-1 h-1 rounded-full bg-blue-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JDownloaderConnectPanel({
  isChecking,
  status,
  onClose,
  onRefresh,
  onSave,
  onSuccess,
}: {
  isChecking: boolean;
  status: 'healthy' | 'no_credentials' | 'no_devices' | 'disconnected' | 'offline';
  onClose: () => void;
  onRefresh: () => Promise<boolean>;
  onSave: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onSuccess: () => void;
}) {
  return (
    <div className="fixed left-0 right-0 bottom-12 z-[110] px-6 pb-4">
      <div className="mx-auto w-full max-w-lg rounded-[2rem] border border-blue-500/20 bg-black/95 backdrop-blur-3xl shadow-[0_-20px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-cinema-fade">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/5 bg-blue-500/10">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-400">Connect MyJDownloader</p>
            <p className="mt-1 text-xs text-gray-400">Nhập email/username và password để kết nối JD trực tiếp từ web.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-4">
          <InlineJDownloaderConnectForm
            isChecking={isChecking}
            status={status}
            onRefresh={onRefresh}
            onSave={onSave}
            onSuccess={onSuccess}
          />
        </div>
      </div>
    </div>
  );
}

function InlineJDownloaderConnectForm({
  isChecking,
  status,
  onRefresh,
  onSave,
  onSuccess,
}: {
  isChecking: boolean;
  status: 'healthy' | 'no_credentials' | 'no_devices' | 'disconnected' | 'offline';
  onRefresh: () => Promise<boolean>;
  onSave: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onSuccess: () => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both username/email and password.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const result = await onSave(email.trim(), password);
    setIsSaving(false);

    if (result.success) {
      setEmail('');
      setPassword('');
      onSuccess();
      return;
    }

    setError(result.error || 'Login failed.');
  };

  const statusText =
    status === 'offline'
      ? 'Downloader service offline'
      : status === 'disconnected'
        ? 'Credentials invalid or connection failed'
        : status === 'no_devices'
          ? 'Connected but no JD node online'
          : 'Ready to connect';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Status</p>
        <p className="mt-2 text-sm text-gray-300">{statusText}</p>
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Username / Email</label>
        <input
          type="text"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/40 focus:bg-white/10"
        />
      </div>

      <div className="space-y-2">
        <label className="text-[10px] font-black uppercase tracking-[0.22em] text-gray-500">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="MyJDownloader password"
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/40 focus:bg-white/10"
        />
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={isChecking || isSaving}
          className="px-4 py-3 rounded-2xl border border-white/10 bg-white/5 text-[10px] font-black uppercase tracking-[0.22em] text-gray-300 hover:bg-white/10 transition-all disabled:opacity-50"
        >
          {isChecking ? 'Checking...' : 'Refresh'}
        </button>
        <button
          type="submit"
          disabled={isSaving}
          className="min-w-[160px] px-5 py-3 rounded-2xl bg-blue-600 text-[10px] font-black uppercase tracking-[0.22em] text-white hover:bg-blue-500 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
          {isSaving ? 'Connecting...' : 'Connect'}
        </button>
      </div>
    </form>
  );
}

function JDownloaderTaskPanel({
  tasks,
  loading,
  error,
  activeDevice,
  accountEmail,
  expandedPackages,
  activeActionKey,
  onClose,
  onRefresh,
  onTogglePackage,
  onPackageAction,
  onLinkAction,
}: {
  tasks: any[];
  loading: boolean;
  error: string | null;
  activeDevice: string | null;
  accountEmail: string | null;
  expandedPackages: Record<string, boolean>;
  activeActionKey: string | null;
  onClose: () => void;
  onRefresh: () => void;
  onTogglePackage: (uuid: string) => void;
  onPackageAction: (action: 'START' | 'STOP_JOB' | 'REMOVE_JOB', task: any) => void;
  onLinkAction: (action: 'START' | 'STOP_JOB' | 'REMOVE_JOB', link: any) => void;
}) {
  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-screen-2xl rounded-[2rem] border border-white/10 bg-[#040404]/95 backdrop-blur-3xl shadow-[0_20px_80px_rgba(0,0,0,0.55)] overflow-hidden animate-cinema-fade">
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/5 bg-white/[0.03]">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-400">JDownloader Queue</p>
              {activeDevice && (
                <span className="text-[9px] font-black uppercase tracking-[0.22em] text-gray-500">
                  Node: {activeDevice}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 truncate">
              {accountEmail || 'MyJDownloader'} • {tasks.length} package{tasks.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onRefresh}
              className="h-9 px-3 rounded-2xl border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10 transition-all flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span className="text-[10px] font-black uppercase tracking-[0.22em]">Refresh</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-2xl border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="max-h-[70vh] overflow-auto custom-scrollbar">
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-[#080808]/95 backdrop-blur-xl">
              <tr className="text-[9px] font-black uppercase tracking-[0.24em] text-gray-500">
                <th className="px-6 py-3">Task</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Progress</th>
                <th className="px-4 py-3">Speed</th>
                <th className="px-4 py-3">ETA</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    Loading JDownloader tasks...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    No active download packages.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => {
                  const isExpanded = expandedPackages[task.uuid];
                  const canExpand = (task.links || []).length > 1;
                  return (
                    <React.Fragment key={task.uuid}>
                      <tr className="border-t border-white/5 align-top">
                        <td className="px-6 py-4">
                          <div className="flex items-start gap-3">
                            {canExpand ? (
                              <button
                                type="button"
                                onClick={() => onTogglePackage(task.uuid)}
                                className="mt-0.5 w-6 h-6 rounded-lg border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center"
                              >
                                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                              </button>
                            ) : (
                              <div className="mt-0.5 w-6 h-6 rounded-lg border border-white/5 bg-white/[0.03] text-gray-600 flex items-center justify-center">
                                <FolderTree className="w-3.5 h-3.5" />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-black text-white truncate">{task.name}</p>
                              <p className="mt-1 text-[11px] text-gray-500">
                                {task.childCount} file{task.childCount === 1 ? '' : 's'}{task.saveTo ? ` • ${task.saveTo}` : ''}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={task.status} running={task.running} finished={task.finished} />
                        </td>
                        <td className="px-4 py-4 min-w-[180px]">
                          <ProgressCell loaded={task.bytesLoaded} total={task.bytesTotal} />
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-300">{formatSpeed(task.speed)}</td>
                        <td className="px-4 py-4 text-sm text-gray-300">{formatEta(task.eta)}</td>
                        <td className="px-6 py-4">
                          <div className="flex justify-end gap-2">
                            <ActionButton
                              label="Start"
                              icon={<Play className="w-3.5 h-3.5" />}
                              disabled={activeActionKey === `START:package:${task.uuid}`}
                              onClick={() => onPackageAction('START', task)}
                            />
                            <ActionButton
                              label="Stop"
                              icon={<Pause className="w-3.5 h-3.5" />}
                              disabled={activeActionKey === `STOP_JOB:package:${task.uuid}`}
                              onClick={() => onPackageAction('STOP_JOB', task)}
                            />
                            <ActionButton
                              label="Remove"
                              tone="danger"
                              icon={<Trash2 className="w-3.5 h-3.5" />}
                              disabled={activeActionKey === `REMOVE_JOB:package:${task.uuid}`}
                              onClick={() => onPackageAction('REMOVE_JOB', task)}
                            />
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (task.links || []).map((link: any) => (
                        <tr key={link.uuid} className="border-t border-white/5 bg-white/[0.02]">
                          <td className="px-6 py-3">
                            <div className="pl-9">
                              <p className="text-sm text-gray-200 truncate">{link.name}</p>
                              <p className="mt-1 text-[11px] text-gray-500">{link.host || 'Unknown host'}</p>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <StatusBadge status={link.status} running={link.running} finished={link.finished} />
                          </td>
                          <td className="px-4 py-3 min-w-[180px]">
                            <ProgressCell loaded={link.bytesLoaded} total={link.bytesTotal} />
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-300">{formatSpeed(link.speed)}</td>
                          <td className="px-4 py-3 text-sm text-gray-300">{formatEta(link.eta)}</td>
                          <td className="px-6 py-3">
                            <div className="flex justify-end gap-2">
                              <ActionButton
                                label="Start"
                                icon={<Play className="w-3.5 h-3.5" />}
                                disabled={activeActionKey === `START:link:${link.uuid}`}
                                onClick={() => onLinkAction('START', link)}
                              />
                              <ActionButton
                                label="Stop"
                                icon={<Pause className="w-3.5 h-3.5" />}
                                disabled={activeActionKey === `STOP_JOB:link:${link.uuid}`}
                                onClick={() => onLinkAction('STOP_JOB', link)}
                              />
                              <ActionButton
                                label="Remove"
                                tone="danger"
                                icon={<Trash2 className="w-3.5 h-3.5" />}
                                disabled={activeActionKey === `REMOVE_JOB:link:${link.uuid}`}
                                onClick={() => onLinkAction('REMOVE_JOB', link)}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function ActionButton({
  label,
  icon,
  tone = 'default',
  disabled,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}) {
  const classes = tone === 'danger'
    ? 'border-red-500/20 bg-red-500/10 text-red-300 hover:bg-red-500/15'
    : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10';

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`h-8 px-3 rounded-xl border transition-all flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] disabled:opacity-50 ${classes}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function StatusBadge({ status, running, finished }: { status: string; running: boolean; finished: boolean }) {
  const tone = finished
    ? 'border-green-500/20 bg-green-500/10 text-green-300'
    : running
      ? 'border-blue-500/20 bg-blue-500/10 text-blue-300'
      : status.toLowerCase().includes('error') || status.toLowerCase().includes('failed')
        ? 'border-red-500/20 bg-red-500/10 text-red-300'
        : 'border-white/10 bg-white/5 text-gray-300';

  return (
    <span className={`inline-flex rounded-xl border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${tone}`}>
      {finished ? 'Finished' : running ? 'Running' : status || 'Idle'}
    </span>
  );
}

function ProgressCell({ loaded, total }: { loaded: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;

  return (
    <div className="space-y-2">
      <div className="h-2 rounded-full bg-white/5 overflow-hidden">
        <div className="h-full rounded-full bg-blue-500" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex items-center justify-between gap-3 text-[11px] text-gray-400">
        <span>{formatBytes(loaded)} / {formatBytes(total)}</span>
        <span>{percent}%</span>
      </div>
    </div>
  );
}

function JDownloaderSettingsModal({
  isOpen,
  onClose,
  status,
  accountEmail,
  hasCredentials,
  activeDevice,
  isJdOnline,
  isChecking,
  onRefresh,
  onSave,
  onLogout,
}: {
  isOpen: boolean;
  onClose: () => void;
  status: 'healthy' | 'no_credentials' | 'no_devices' | 'disconnected' | 'offline';
  accountEmail: string | null;
  hasCredentials: boolean;
  activeDevice: string | null;
  isJdOnline: boolean;
  isChecking: boolean;
  onRefresh: () => Promise<boolean>;
  onSave: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  onLogout: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [email, setEmail] = useState(accountEmail || '');
  const [password, setPassword] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setEmail(accountEmail || '');
    setPassword('');
    setError(null);
  }, [isOpen, accountEmail]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password.');
      return;
    }

    setIsSaving(true);
    setError(null);
    const result = await onSave(email.trim(), password);
    setIsSaving(false);

    if (result.success) {
      setPassword('');
      onClose();
      return;
    }

    setError(result.error || 'Login failed.');
  };

  const statusLabel =
    status === 'healthy'
      ? 'Connected'
      : status === 'no_credentials'
        ? 'Credentials required'
        : status === 'no_devices'
          ? 'No online nodes'
          : status === 'disconnected'
            ? 'Connection lost'
            : 'Service offline';

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-[#060606]/95 backdrop-blur-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] overflow-hidden animate-cinema-fade">
        <div className="flex items-start justify-between gap-4 px-7 py-5 border-b border-white/5 bg-white/[0.03]">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/15 border border-blue-500/20 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-blue-400" />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-400">JDownloader Settings</p>
              <h3 className="text-2xl font-black italic tracking-tight">Connect MyJDownloader</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl border border-white/10 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-7 space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatusTile label="Status" value={statusLabel} tone={isJdOnline ? 'blue' : 'red'} />
            <StatusTile label="Account" value={accountEmail || 'Not linked'} tone={hasCredentials ? 'green' : 'amber'} />
            <StatusTile label="Active Node" value={activeDevice || 'None'} tone={activeDevice ? 'blue' : 'slate'} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">MyJDownloader Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/40 focus:bg-white/10"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-[0.24em] text-gray-500">App Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={hasCredentials ? 'Enter a new password to update' : 'Enter your MyJDownloader password'}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition-all focus:border-blue-500/40 focus:bg-white/10"
              />
            </div>

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => void onRefresh()}
                  disabled={isChecking || isSaving}
                  className="px-4 py-3 rounded-2xl border border-white/10 bg-white/5 text-[11px] font-black uppercase tracking-[0.24em] text-gray-300 hover:bg-white/10 transition-all disabled:opacity-50"
                >
                  {isChecking ? 'Refreshing...' : 'Refresh'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 px-5 py-3 rounded-2xl bg-blue-600 text-[11px] font-black uppercase tracking-[0.24em] text-white hover:bg-blue-500 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isSaving ? 'Connecting...' : 'Save & Connect'}
                </button>
              </div>
              
              {hasCredentials && (
                <button
                  type="button"
                  onClick={async () => {
                    setIsLoggingOut(true);
                    setError(null);
                    const result = await onLogout();
                    setIsLoggingOut(false);
                    if (result.success) {
                      onClose();
                      return;
                    }
                    setError(result.error || 'Logout failed.');
                  }}
                  disabled={isSaving || isLoggingOut}
                  className="w-full px-4 py-3 rounded-2xl border border-red-500/20 bg-red-500/10 text-[11px] font-black uppercase tracking-[0.24em] text-red-300 hover:bg-red-500/15 transition-all disabled:opacity-50"
                >
                  {isLoggingOut ? 'Logging Out...' : 'Logout MyJDownloader'}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: string; tone: 'blue' | 'green' | 'red' | 'amber' | 'slate' }) {
  const toneClass = {
    blue: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
    green: 'border-green-500/20 bg-green-500/10 text-green-300',
    red: 'border-red-500/20 bg-red-500/10 text-red-300',
    amber: 'border-yellow-500/20 bg-yellow-500/10 text-yellow-300',
    slate: 'border-white/10 bg-white/5 text-gray-300',
  }[tone];

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <p className="text-[9px] font-black uppercase tracking-[0.24em] opacity-70">{label}</p>
      <p className="mt-2 text-[10px] font-black truncate">{value}</p>
    </div>
  );
}

function formatBytes(value: number) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size >= 10 || index === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[index]}`;
}

function formatSpeed(value: number) {
  if (!value) return '0 B/s';
  return `${formatBytes(value)}/s`;
}

function formatEta(value: number) {
  if (!value || value < 0) return '--';
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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
