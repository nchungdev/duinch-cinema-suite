import { useState, useEffect, useRef } from 'react';
import { Loader2, Activity, Zap, Magnet, Globe, Box, RefreshCw, HardDrive, Search } from 'lucide-react';
import { api } from '../../api/config';
import type { MediaLink, StreamingServer, StreamingEpisode } from '../../api/config';
import { useCloudViewModel } from '../view-models/CloudViewModel';

interface DiscoveryPipelineProps {
  tmdbId: number;
  title: string;           // original/English title
  localizeTitle?: string;  // localized (e.g. Vietnamese) title
  year?: string | number;
  mediaType: string;
  season?: number;         // active season for discovery TV
  onStreamingReady?: (links: any[]) => void;
}

// ── Per-provider colour + icon ─────────────────────────────────────────────
const PROVIDER_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  kkphim:      { color: 'text-orange-400',  label: 'KKPhim', icon: <Zap className="w-3 h-3" /> },
  ophim:       { color: 'text-pink-400',    label: 'OPhim',  icon: <Zap className="w-3 h-3" /> },
  thuviencine: { color: 'text-emerald-400', label: 'Cine',   icon: <HardDrive className="w-3 h-3" /> },
  fshare:      { color: 'text-green-400',   label: 'FShare', icon: <Search className="w-3 h-3" /> },
  torrent:     { color: 'text-blue-400',    label: 'Torrent', icon: <Magnet className="w-3 h-3" /> },
  gdrive:      { color: 'text-purple-400',  label: 'Drive',   icon: <Globe className="w-3 h-3" /> },
};

export const DiscoveryPipeline = ({ tmdbId, title, localizeTitle, year, mediaType, season, onStreamingReady }: DiscoveryPipelineProps) => {
  const cloudTargets = useCloudViewModel();

  const [streamableResults, setStreamableResults] = useState<Record<string, Record<string, any[]>>>({});
  const [downloadableResults, setDownloadableResults] = useState<Record<string, MediaLink[]>>({});

  const [loadingProviders, setLoadingProviders] = useState<Set<string>>(new Set());
  const [doneProviders, setLoadingDone] = useState<Set<string>>(new Set());
  
  const [activeTab, setActiveTab] = useState<string>('');
  const [streamingNotified, setStreamingNotified] = useState(false);
  
  const fetchLock = useRef<string | null>(null);

  const startDiscovery = async (force = false) => {
    const providers = ['kkphim', 'ophim', 'thuviencine', 'torrent', 'fshare', 'gdrive'];
    const currentTaskKey = `${tmdbId}-${season || 1}-${force}`;
    
    if (fetchLock.current === currentTaskKey) return;
    fetchLock.current = currentTaskKey;

    const ctrl = new AbortController();

    // Reset state
    setStreamableResults({});
    setDownloadableResults({});
    setLoadingProviders(new Set(providers));
    setLoadingDone(new Set());
    setActiveTab('');
    setStreamingNotified(false);

    let firstSettledTab = '';

    providers.forEach(async (p) => {
      try {
        const params = new URLSearchParams({
          tmdb_id: String(tmdbId),
          media_type: mediaType,
          title,
          force: String(force),
          ...(localizeTitle ? { localize_title: localizeTitle } : {}),
          ...(year           ? { year: String(year) }           : {}),
          ...(season         ? { season: String(season) }       : {}),
          provider: p,
        });

        const res = await api.get<{ results: any[], provider: string }>(
          `/media/discovery?${params}`,
          { signal: ctrl.signal }
        );

        const data = res.data;
        if (!data || !data.results || data.results.length === 0) {
           markDone(p);
           return;
        }

        const results = data.results;
        const streamable = results.filter(r => r.type === 'streamable');
        const downloadable = results.filter(r => r.type === 'downloadable');

        if (streamable.length > 0) {
          setStreamableResults(prev => {
            const next = { ...prev };
            const provMap: Record<string, any[]> = {};
            for (const item of streamable) {
              const server = item.server || item.server_name || 'Server';
              if (!provMap[server]) provMap[server] = [];
              provMap[server].push(item);
            }
            next[p] = provMap;
            return next;
          });
          if (!streamingNotified) {
             onStreamingReady?.(streamable);
             setStreamingNotified(true);
          }
          if (!firstSettledTab) { firstSettledTab = p; setActiveTab(p); }
        }

        if (downloadable.length > 0) {
          setDownloadableResults(prev => ({ ...prev, [p]: downloadable }));
          if (!firstSettledTab) { firstSettledTab = p; setActiveTab(p); }
        }

        markDone(p);
      } catch (err: any) {
        if (err.name !== 'CanceledError' && err.name !== 'AbortError') markDone(p);
      }
    });

    return () => { ctrl.abort(); fetchLock.current = null; };
  };

  const markDone = (p: string) => {
    setLoadingProviders(prev => { const n = new Set(prev); n.delete(p); return n; });
    setLoadingDone(prev => { const n = new Set(prev); n.add(p); return n; });
  };

  useEffect(() => {
    startDiscovery(false);
  }, [tmdbId, title, localizeTitle, year, mediaType, season]);

  const tabs = [
    ...Object.entries(streamableResults).map(([id, s]) => ({ id, ...PROVIDER_META[id], badge: `${Object.keys(s).length} sv` })),
    ...Object.entries(downloadableResults).map(([id, l]) => ({ id, ...PROVIDER_META[id], badge: `${l.length}` })),
  ].sort((a, b) => {
    const order = ['kkphim', 'ophim', 'thuviencine', 'torrent', 'fshare', 'gdrive'];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });

  return (
    <div className="glass-dark p-6 rounded-[2.5rem] border border-blue-500/10 space-y-4 relative overflow-hidden shadow-xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-2">
        <div className="flex items-center gap-3">
          <Activity className={`w-4 h-4 ${loadingProviders.size > 0 ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
          <button onClick={() => startDiscovery(true)} disabled={loadingProviders.size > 0} className="ml-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all">
            <RefreshCw className={`w-3 h-3 text-gray-500 ${loadingProviders.size > 0 ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-1">
           {['kkphim', 'ophim', 'thuviencine', 'torrent', 'fshare', 'gdrive'].map(p => (
             <div key={p} title={p} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
               doneProviders.has(p) ? 'bg-green-500 shadow-[0_0_4px_#22c55e]' :
               loadingProviders.has(p) ? 'bg-blue-500 animate-pulse shadow-[0_0_4px_#3b82f6]' : 'bg-white/5'
             }`} />
           ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap min-h-[36px]">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
              activeTab === tab.id ? `bg-white/10 border-white/20 ${tab.color}` : 'bg-white/5 text-gray-500 border-transparent hover:bg-white/8'
            }`}>
            {tab.icon} {tab.label}
            <span className="px-1.5 py-0.5 rounded-md text-[7px] font-black bg-white/10 text-white ml-1">{tab.badge}</span>
          </button>
        ))}
        {loadingProviders.size > 0 && <div className="flex items-center gap-1.5 text-[8px] font-black text-gray-600 uppercase ml-2 animate-pulse"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Scanning...</div>}
      </div>

      <div className="min-h-[56px] animate-cinema-fade" key={activeTab}>
        {streamableResults[activeTab] && (
          <div className="space-y-1">
            {Object.entries(streamableResults[activeTab]).map(([srv, eps]) => (
              <div key={srv} className="rounded-xl border bg-black/30 border-white/5 p-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <Globe className="w-3 h-3 text-orange-400" />
                   <span className="text-[10px] font-black uppercase tracking-widest text-gray-300">{srv}</span>
                   <span className="text-[9px] font-bold text-gray-600">({eps.length} tập)</span>
                </div>
                <div className="flex gap-2">
                   {eps.slice(0, 3).map((ep, i) => (
                      <button key={i} className="px-2 py-1 bg-white/5 rounded text-[8px] font-bold text-gray-400 hover:text-white transition-colors">
                        {ep.name || `Ep ${i+1}`}
                      </button>
                   ))}
                   {eps.length > 3 && <span className="text-[8px] text-gray-600 self-center">+{eps.length-3}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {downloadableResults[activeTab] && (
          <div className="space-y-1">
             {downloadableResults[activeTab].map((l, i) => (
               <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/5 group hover:bg-black/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold text-gray-300 truncate">{l.name}</p>
                    {l.size && <p className="text-[7px] text-gray-600">{(l.size / 1024**3).toFixed(1)} GB</p>}
                  </div>
                  <button onClick={() => window.open(l.url, '_blank')} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[8px] font-black uppercase hover:bg-white/15 transition-all text-blue-400">
                    {activeTab === 'torrent' ? 'Magnet' : 'Download'}
                  </button>
               </div>
             ))}
          </div>
        )}
      </div>
    </div>
  );
};
