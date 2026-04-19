import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Loader2, HardDrive, Activity, Zap, Magnet, Globe, Download, ExternalLink, ChevronDown, Server, Box, Cloud, Search, RefreshCw } from 'lucide-react';
import { MediaRepository } from '../../infrastructure/repositories/MediaRepository';
import { RankingService } from '../../domain/services/RankingService';
import type { MediaLink, StreamingEpisode, StreamingServer } from '../../api/config';
import { useCloudViewModel } from '../view-models/CloudViewModel';
import type { CloudTarget } from '../../services/cloudTargets';

interface DiscoveryPipelineProps {
  tmdbId: number;
  title: string;           // original/English title
  localizeTitle?: string;  // localized (e.g. Vietnamese) title
  year?: string | number;
  mediaType: string;
  season?: number;         // active season for discovery TV
  initialSeason?: number;
  initialEpisode?: number;
  onStreamingReady?: (links: any[], source: string) => void;
}

// ── Tab descriptor ─────────────────────────────────────────────────────────
interface SourceTab {
  id: string;          // unique key
  label: string;
  icon: React.ReactNode;
  color: string;       // tailwind text-* class
  badge: string;       // short count label
}

// ── Per-provider colour + icon ─────────────────────────────────────────────
const SOURCE_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  m3u8:    { label: 'Stream',  color: 'text-orange-400', icon: <Zap      className="w-3 h-3" /> },
  fshare:  { label: 'FShare',  color: 'text-red-400',    icon: <Box      className="w-3 h-3" /> },
  torrent: { label: 'Torrent', color: 'text-green-400',  icon: <Magnet   className="w-3 h-3" /> },
  gdrive:  { label: 'Drive',   color: 'text-purple-400', icon: <Globe    className="w-3 h-3" /> },
};

const SOURCE_BADGE: Record<string, string> = {
  kkphim: 'KKPhim', ophim: 'OPhim', timfshare: 'TimFShare', thuviencine: 'CineScan', web: 'GSearch', default: 'Torrent', googlesearch: 'Drive'
};

const DISCOVERY_SOURCES = [
  { source_type: 'm3u8',        source: 'kkphim'       },
  { source_type: 'm3u8',        source: 'ophim'        },
  { source_type: 'fshare',      source: 'timfshare'    },
  { source_type: 'fshare',      source: 'thuviencine'  },
  { source_type: 'fshare',      source: 'web'          },
  { source_type: 'torrent',     source: 'default'      },
  { source_type: 'gdrive',      source: 'googlesearch' },
] as const;

export const DiscoveryPipeline = ({ tmdbId, title, localizeTitle, year, mediaType, season, initialSeason, initialEpisode, onStreamingReady }: DiscoveryPipelineProps) => {
  const cloudTargets = useCloudViewModel();

  const [streamableByType, setStreamableByType] = useState<Record<string, Record<string, any[]>>>({});
  const [downloadableByType, setDownloadableByType] = useState<Record<string, MediaLink[]>>({});

  const [loadingSources, setLoadingSources] = useState<Set<string>>(new Set());
  const [doneSources,    setDoneSources]    = useState<Set<string>>(new Set());
  const [activeTab,      setActiveTab]      = useState<string>('');
  
  const streamingNotifiedRef = useRef<Set<string>>(new Set());
  const fetchLock = useRef<string | null>(null);

  const fetchSources = async (force = false) => {
    const currentTaskKey = `${tmdbId}-${season || 1}-${force}`;
    if (fetchLock.current === currentTaskKey) return;
    fetchLock.current = currentTaskKey;

    const ctrl = new AbortController();
    
    setStreamableByType({});
    setDownloadableByType({});
    setLoadingSources(new Set());
    setDoneSources(new Set());
    setActiveTab('');
    streamingNotifiedRef.current = new Set();

    const isTV = mediaType === 'tv';
    const targetSeason = isTV ? (season ?? initialSeason) : undefined;
    const targetEpisode = isTV ? initialEpisode : undefined;

    MediaRepository.discoverSourcesStream(
      {
        tmdb_id: tmdbId,
        media_type: mediaType,
        title,
        force,
        localize_title: localizeTitle,
        year: String(year || ''),
        season: targetSeason,
        episode: targetEpisode,
      },
      {
        onInit: (_total, sources) => {
           setLoadingSources(new Set(sources.map((s: any) => `${s.source_type}:${s.source}`)));
        },
        onResult: (source_type, source, items, error) => {
          const key = `${source_type}:${source}`;
          setLoadingSources(prev => { const n = new Set(prev); n.delete(key); return n; });
          setDoneSources(prev => { const n = new Set(prev); n.add(key); return n; });

          if (error || !items || items.length === 0) return;

          if (source_type === 'm3u8') {
            setStreamableByType(prev => {
              const next = { ...prev };
              const existing: Record<string, any[]> = { ...(next['m3u8'] ?? {}) };
              for (const group of items) {
                const srv = group.server || source;
                if (!existing[srv]) existing[srv] = [];
                // Combine and deduplicate episodes by name within server
                const mergedEps = [...existing[srv], ...(group.episodes ?? []).map((ep: any) => ({ ...ep, source }))];
                const seenEps = new Set();
                existing[srv] = mergedEps.filter(e => {
                   const k = `${e.name}-${e.m3u8}`;
                   if (seenEps.has(k)) return false;
                   seenEps.add(k);
                   return true;
                });
              }
              next['m3u8'] = existing;
              return next;
            });

            if (!streamingNotifiedRef.current.has(source)) {
              streamingNotifiedRef.current.add(source);
              const flat = items.flatMap((g: any) => (g.episodes ?? []).map((ep: any) => ({ ...ep, server: g.server, source })));
              onStreamingReady?.(flat, source);
            }
          } else {
            setDownloadableByType(prev => {
              const existing = prev[source_type] ?? [];
              const combined = [...existing, ...items];
              const seenUrls = new Set();
              const deduped = combined.filter(l => {
                if (seenUrls.has(l.url)) return false;
                seenUrls.add(l.url);
                return true;
              });
              return { ...prev, [source_type]: RankingService.sortMediaLinks(deduped) };
            });
          }
        },
        onDone: () => { setLoadingSources(new Set()); fetchLock.current = null; },
        onError: () => { setLoadingSources(new Set()); fetchLock.current = null; }
      },
      ctrl.signal
    );

    return () => { 
        ctrl.abort(); 
        fetchLock.current = null; 
    };
  };

  useEffect(() => {
    fetchSources(false);
  }, [tmdbId, season]);

  const tabs = ['m3u8', 'fshare', 'torrent', 'gdrive'].flatMap(st => {
    const isStreamable = st === 'm3u8';
    const hasResults   = isStreamable ? !!streamableByType[st] : !!downloadableByType[st];
    if (!hasResults) return [];
    const meta  = SOURCE_TYPE_META[st] || { label: st, color: 'text-sky-400', icon: <Box className="w-3 h-3" /> };
    const count = isStreamable ? Object.keys(streamableByType[st] ?? {}).length : (downloadableByType[st] ?? []).length;
    return [{ id: st, label: meta.label, icon: meta.icon, color: meta.color, badge: String(count) }];
  });

  useLayoutEffect(() => {
    if (tabs.length > 0 && !activeTab) setActiveTab(tabs[0].id);
  }, [tabs, activeTab]);

  return (
    <div className="glass-dark p-6 rounded-[2.5rem] border border-blue-500/10 space-y-4 relative overflow-hidden shadow-xl">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-2">
        <div className="flex items-center gap-3">
          <Activity className={`w-4 h-4 ${loadingSources.size > 0 ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
          <button onClick={() => fetchSources(true)} disabled={loadingSources.size > 0} className="ml-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all group">
            <RefreshCw className={`w-3 h-3 text-gray-500 group-hover:text-blue-400 ${loadingSources.size > 0 ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {Array.from(new Set([...Array.from(loadingSources), ...Array.from(doneSources)])).map(key => (
            <div key={key} title={key} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${doneSources.has(key) ? 'bg-green-500 shadow-[0_0_4px_#22c55e]' : 'bg-blue-500 animate-pulse shadow-[0_0_4px_#3b82f6]'}`} />
          ))}
        </div>
      </div>

      {/* Tab bar */}
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
        {loadingSources.size > 0 && <div className="flex items-center gap-1.5 text-[8px] font-black text-gray-600 uppercase ml-2 animate-pulse"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Scanning...</div>}
      </div>

      {/* Tab content */}
      <div className="min-h-[56px] animate-cinema-fade" key={activeTab}>
        {/* Streamable Content (QuickServerRow) */}
        {activeTab === 'm3u8' && streamableByType['m3u8'] && (
          <div className="space-y-1">
            {Object.entries(streamableByType['m3u8']).map(([srv, eps]) => (
              <QuickServerRow key={srv} serverName={srv} episodes={eps} color="text-orange-400" cloudTargets={cloudTargets.targets} />
            ))}
          </div>
        )}

        {/* Downloadable Content (DeepRow) */}
        {activeTab !== 'm3u8' && downloadableByType[activeTab] && (
          <div className="space-y-1">
             {downloadableByType[activeTab].map((l, i) => (
               <DeepRow key={i} link={l} 
                 actionLabel={activeTab === 'torrent' ? 'Magnet' : activeTab === 'gdrive' ? 'Drive' : 'FShare'} 
                 color={SOURCE_TYPE_META[activeTab].color} 
               />
             ))}
          </div>
        )}

        {!activeTab && loadingSources.size === 0 && (
          <div className="py-4 text-center text-[9px] font-black uppercase tracking-widest text-gray-700 italic">
            No specific results for current selection
          </div>
        )}
      </div>
    </div>
  );
};

// ── Quick Server Row (Full Featured) ─────────────────────────────────────────
function QuickServerRow({ serverName, episodes, color = 'text-orange-400', cloudTargets }: {
  serverName: string; episodes: any[]; color?: string; cloudTargets: CloudTarget[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleEp  = (i: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });
  const toggleAll = () =>
    setSelected(prev => prev.size === episodes.length ? new Set() : new Set(episodes.map((_, i) => i)));

  return (
    <div className={`rounded-xl border transition-all overflow-hidden ${
      open ? 'bg-white/5 border-white/10' : 'bg-black/30 border-white/5 hover:border-white/10'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
        <button onClick={() => setOpen(!open)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
          <Globe className={`w-3 h-3 ${color} shrink-0`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 truncate">{serverName}</span>
          <span className="text-[9px] font-bold text-gray-600 shrink-0">({episodes.length} tập)</span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {open && (
            <button onClick={toggleAll} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-[8px] font-black uppercase text-gray-500 hover:text-white transition-all">
              {selected.size === episodes.length ? 'Bỏ chọn' : 'Chọn tất cả'}
            </button>
          )}
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 text-gray-300 border border-white/10 text-[8px] font-black uppercase tracking-widest">
            <HardDrive className="w-2.5 h-2.5" /> {selected.size > 0 ? `Device (${selected.size})` : 'Device'}
          </button>
          <button onClick={() => setOpen(!open)} className="p-1 rounded-lg hover:bg-white/8 transition-all">
            <ChevronDown className={`w-3.5 h-3.5 text-gray-600 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 animate-cinema-fade">
          {episodes.map((ep, i) => (
            <button key={i} onClick={() => toggleEp(i)}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border transition-all ${
                selected.has(i) ? 'bg-blue-600/20 border-blue-500/40 text-blue-400' : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/15'
              }`}>
              <div className={`w-3 h-3 rounded shrink-0 border flex items-center justify-center ${selected.has(i) ? 'bg-blue-500 border-blue-400' : 'border-white/20'}`}>
                {selected.has(i) && <span className="text-[6px] text-white font-black">✓</span>}
              </div>
              <span className="text-[9px] font-bold truncate">{ep.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared Deep Row (Full Featured) ──────────────────────────────────────────
function DeepRow({ link, actionLabel, color }: { link: MediaLink; actionLabel: string; color: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/5 group hover:bg-black/50 transition-all">
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-bold text-gray-300 truncate group-hover:text-white transition-colors" title={link.name}>
          {link.name || 'Unknown Item'}
        </p>
        <div className="flex items-center gap-2">
           <span className="text-[7px] font-black text-blue-500/60 uppercase tracking-widest">{SOURCE_BADGE[(link as any).source] || (link as any).source}</span>
           {link.size && <span className="text-[7px] font-bold text-gray-600">{formatSize(link.size)}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
         {(link as any).source_page && (
            <a href={(link as any).source_page} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-all">
               <ExternalLink className="w-3 h-3" />
            </a>
         )}
         <button onClick={() => window.open(link.url, '_blank')}
           className={`px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[8px] font-black uppercase transition-all ${color} hover:bg-white/15`}>
           <Download className="w-2.5 h-2.5 inline mr-1" /> {actionLabel}
         </button>
      </div>
    </div>
  );
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}
