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

const SOURCE_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  m3u8:    { label: 'Stream',  color: 'text-orange-400', icon: <Zap      className="w-3 h-3" /> },
  fshare:  { label: 'FShare',  color: 'text-red-400',    icon: <Box      className="w-3 h-3" /> },
  torrent: { label: 'Torrent', color: 'text-green-400',  icon: <Magnet   className="w-3 h-3" /> },
  gdrive:  { label: 'Drive',   color: 'text-purple-400', icon: <Globe    className="w-3 h-3" /> },
};

const SOURCE_BADGE: Record<string, string> = {
  kkphim: 'KKPhim', ophim: 'OPhim', timfshare: 'TimFShare', thuviencine: 'CineScan', web: 'GSearch', default: 'Torrent', googlesearch: 'Drive'
};

export const DiscoveryPipeline = ({
  tmdbId, title, localizeTitle, year, mediaType, season, initialSeason, initialEpisode, onStreamingReady,
}: DiscoveryPipelineProps) => {
  const cloudTargets = useCloudViewModel();

  const [streamableByType, setStreamableByType] = useState<Record<string, Record<string, any[]>>>({});
  const [downloadableByType, setDownloadableByType] = useState<Record<string, MediaLink[]>>({});

  const [loadingSources, setLoadingSources] = useState<Set<string>>(new Set());
  const [doneSources,    setDoneSources]    = useState<Set<string>>(new Set());
  const [activeTab,      setActiveTab]      = useState<string>('');
  
  const streamingNotifiedRef = useRef<Set<string>>(new Set());
  const fetchLock = useRef<string | null>(null);

  const fetchSources = async (force = false) => {
    // Current task identity
    const currentTaskKey = `${tmdbId}-${season || 1}-${force}`;
    
    // Prevent starting the SAME task again if it's already running
    if (fetchLock.current === currentTaskKey) return;
    fetchLock.current = currentTaskKey;

    const ctrl = new AbortController();
    
    // Reset internal state
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
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-2">
        <div className="flex items-center gap-3">
          <Activity className={`w-4 h-4 ${loadingSources.size > 0 ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
          <button onClick={() => fetchSources(true)} disabled={loadingSources.size > 0} className="ml-2 p-1 rounded hover:bg-white/5">
            <RefreshCw className={`w-3 h-3 text-gray-500 ${loadingSources.size > 0 ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          {Array.from(new Set([...Array.from(loadingSources), ...Array.from(doneSources)])).map(key => (
            <div key={key} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${doneSources.has(key) ? 'bg-green-500 shadow-[0_0_4px_#22c55e]' : 'bg-blue-500 animate-pulse'}`} />
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
        {loadingSources.size > 0 && <div className="flex items-center gap-1.5 text-[8px] font-black text-gray-600 uppercase ml-2 animate-pulse"><Loader2 className="w-2.5 h-2.5 animate-spin" /> Scanning...</div>}
      </div>

      <div className="min-h-[56px] animate-cinema-fade" key={activeTab}>
        {activeTab === 'm3u8' && streamableByType['m3u8'] && Object.entries(streamableByType['m3u8']).map(([srv, eps]) => (
            <div key={srv} className="mb-1 p-3 rounded-xl border bg-black/30 border-white/5 flex items-center justify-between">
               <div className="flex items-center gap-3">
                  <Globe className="w-3 h-3 text-orange-400" />
                  <span className="text-[10px] font-black uppercase text-gray-300">{srv}</span>
                  <span className="text-[8px] font-bold text-gray-600">({eps.length} eps)</span>
               </div>
               <div className="flex gap-1">
                  {eps.slice(0, 3).map((e, i) => <span key={i} className="px-2 py-0.5 bg-white/5 rounded text-[7px] text-gray-500">{e.name}</span>)}
               </div>
            </div>
        ))}
        {activeTab !== 'm3u8' && downloadableByType[activeTab] && downloadableByType[activeTab].map((l, i) => (
            <div key={i} className="mb-1 flex items-center gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/5 group hover:bg-black/50">
               <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold text-gray-300 truncate">{l.name}</p>
                  <span className="text-[8px] font-black text-blue-500/60 uppercase tracking-widest">{SOURCE_BADGE[(l as any).source] || (l as any).source}</span>
               </div>
               <button onClick={() => window.open(l.url, '_blank')} className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[8px] font-black uppercase text-blue-400 hover:bg-white/15 transition-all">Link</button>
            </div>
        ))}
      </div>
    </div>
  );
};
