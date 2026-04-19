import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Loader2, Activity, Zap, Magnet, Globe, Box, RefreshCw, HardDrive, Search, Tv } from 'lucide-react';
import { MediaRepository } from '../../infrastructure/repositories/MediaRepository';
import { RankingService } from '../../domain/services/RankingService';
import type { MediaLink, StreamingEpisode } from '../../api/config';
import { useCloudViewModel } from '../view-models/CloudViewModel';

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

const DISCOVERY_SOURCES = [
  { source_type: 'm3u8',        source: 'kkphim'       },
  { source_type: 'm3u8',        source: 'ophim'        },
  { source_type: 'fshare',      source: 'timfshare'    },
  { source_type: 'fshare',      source: 'thuviencine'  },
  { source_type: 'fshare',      source: 'web'          },
  { source_type: 'torrent',     source: 'default'      },
  { source_type: 'gdrive',      source: 'googlesearch' },
] as const;

type SourceType = typeof DISCOVERY_SOURCES[number]['source_type'];
type LoadingKey = `${SourceType}:${string}`;

const SOURCE_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  m3u8:    { label: 'Stream',  color: 'text-orange-400', icon: <Zap      className="w-3 h-3" /> },
  fshare:  { label: 'FShare',  color: 'text-red-400',    icon: <Box      className="w-3 h-3" /> },
  torrent: { label: 'Torrent', color: 'text-green-400',  icon: <Magnet   className="w-3 h-3" /> },
  gdrive:  { label: 'Drive',   color: 'text-purple-400', icon: <Globe    className="w-3 h-3" /> },
};

const toKey = (st: string, src: string): LoadingKey => `${st}:${src}` as LoadingKey;
const ALL_KEYS: LoadingKey[] = DISCOVERY_SOURCES.map(d => toKey(d.source_type, d.source));

export const DiscoveryPipeline = ({
  tmdbId, title, localizeTitle, year, mediaType, season, initialSeason, initialEpisode, onStreamingReady,
}: DiscoveryPipelineProps) => {
  const cloudTargets = useCloudViewModel();

  const [streamableByType, setStreamableByType] = useState<Record<string, Record<string, any[]>>>({});
  const [downloadableByType, setDownloadableByType] = useState<Record<string, MediaLink[]>>({});

  const [loadingKeys, setLoadingKeys] = useState<Set<LoadingKey>>(new Set());
  const [doneKeys,    setDoneKeys]    = useState<Set<LoadingKey>>(new Set());
  const [activeTab,   setActiveTab]   = useState<string>('');
  
  const streamingNotifiedRef = useRef<Set<string>>(new Set());
  const fetchLock = useRef<string | null>(null);

  const fetchSources = async (force = false) => {
    const currentTaskKey = `${tmdbId}-${season || 1}-${force}`;
    if (fetchLock.current === currentTaskKey) return;
    fetchLock.current = currentTaskKey;

    const ctrl = new AbortController();
    
    // 1. Reset states
    setStreamableByType({});
    setDownloadableByType({});
    setLoadingKeys(new Set(ALL_KEYS));
    setDoneKeys(new Set());
    setActiveTab('');
    streamingNotifiedRef.current = new Set();

    const markDone = (key: LoadingKey) => {
      setLoadingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      setDoneKeys(prev    => { const n = new Set(prev); n.add(key);    return n; });
    };

    const isTV = mediaType === 'tv';
    const targetSeason = isTV ? (season ?? initialSeason) : undefined;
    const targetEpisode = isTV ? initialEpisode : undefined;

    // 2. Call the SSE Streaming API
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
        onResult: (source_type, source, items, error) => {
          const key = toKey(source_type, source);
          if (error || !items || items.length === 0) {
            markDone(key); return;
          }

          if (source_type === 'm3u8') {
            setStreamableByType(prev => {
              const next = { ...prev };
              const existing: Record<string, any[]> = { ...(next['m3u8'] ?? {}) };
              for (const group of items) {
                const srv = group.server || source;
                if (!existing[srv]) existing[srv] = [];
                existing[srv].push(...(group.episodes ?? []).map((ep: any) => ({ ...ep, source })));
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
              return { ...prev, [source_type]: RankingService.sortMediaLinks(combined) };
            });
          }
          markDone(key);
        },
        onDone: () => { setLoadingKeys(new Set()); fetchLock.current = null; },
        onError: () => { setLoadingKeys(new Set()); fetchLock.current = null; }
      },
      ctrl.signal
    );

    return () => { ctrl.abort(); fetchLock.current = null; };
  };

  useEffect(() => {
    fetchSources(false);
  }, [tmdbId, season]);

  const tabs = ['m3u8', 'fshare', 'torrent', 'gdrive'].flatMap(st => {
    const isStreamable = st === 'm3u8';
    const hasResults   = isStreamable ? !!streamableByType[st] : !!downloadableByType[st];
    const isLoadingType = DISCOVERY_SOURCES.filter(d => d.source_type === st).some(d => loadingKeys.has(toKey(d.source_type, d.source)));
    if (!hasResults && !isLoadingType) return [];
    const meta  = SOURCE_TYPE_META[st] || { label: st, color: 'text-sky-400', icon: <Box className="w-3 h-3" /> };
    const count = isStreamable ? Object.keys(streamableByType[st] ?? {}).length : (downloadableByType[st] ?? []).length;
    return [{ id: st, label: meta.label, icon: meta.icon, color: meta.color, badge: String(count), isLoading: isLoadingType }];
  });

  useLayoutEffect(() => {
    if (tabs.length > 0 && !activeTab) setActiveTab(tabs[0].id);
  }, [tabs, activeTab]);

  return (
    <div className="glass-dark p-6 rounded-[2.5rem] border border-blue-500/10 space-y-4 relative overflow-hidden shadow-xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-2">
        <div className="flex items-center gap-3">
          <Activity className={`w-4 h-4 ${loadingKeys.size > 0 ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
          <button onClick={() => fetchSources(true)} disabled={loadingKeys.size > 0} className="ml-2 p-1 rounded hover:bg-white/5">
            <RefreshCw className={`w-3 h-3 text-gray-500 ${loadingKeys.size > 0 ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {ALL_KEYS.map(key => (
            <div key={key} className={`w-1 h-1 rounded-full transition-all duration-500 ${doneKeys.has(key) ? 'bg-green-500' : loadingKeys.has(key) ? 'bg-blue-500 animate-pulse' : 'bg-white/5'}`} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap min-h-[36px]">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
              activeTab === tab.id ? `bg-white/10 border-white/20 ${tab.color}` : 'bg-white/5 text-gray-500 border-transparent'
            }`}>
            {tab.icon} {tab.label}
            <span className="px-1.5 py-0.5 rounded-md text-[7px] font-black bg-white/10 text-white ml-1">{tab.badge}</span>
          </button>
        ))}
        {loadingKeys.size > 0 && <Loader2 className="w-3 h-3 animate-spin text-gray-600 ml-2" />}
      </div>

      <div className="min-h-[56px] animate-cinema-fade" key={activeTab}>
        {activeTab === 'm3u8' && streamableByType['m3u8'] && Object.entries(streamableByType['m3u8']).map(([srv, eps]) => (
            <div key={srv} className="mb-1 p-3 rounded-xl border bg-black/30 border-white/5 flex items-center justify-between">
               <span className="text-[10px] font-black uppercase text-gray-300">{srv} ({eps.length} eps)</span>
               <div className="flex gap-1">
                  {eps.slice(0, 5).map((e, i) => <span key={i} className="px-2 py-0.5 bg-white/5 rounded text-[7px] text-gray-500">{e.name}</span>)}
               </div>
            </div>
        ))}
        {activeTab !== 'm3u8' && downloadableByType[activeTab] && downloadableByType[activeTab].map((l, i) => (
            <div key={i} className="mb-1 flex items-center gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/5 group">
               <div className="flex-1 min-w-0"><p className="text-[9px] font-bold text-gray-300 truncate">{l.name}</p></div>
               <button onClick={() => window.open(l.url, '_blank')} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[8px] font-black uppercase text-blue-400">Link</button>
            </div>
        ))}
      </div>
    </div>
  );
};
