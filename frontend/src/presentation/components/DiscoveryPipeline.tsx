import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Loader2, Activity, Zap, Magnet, Globe, Box, Tv, RefreshCw } from 'lucide-react';
import { MediaRepository } from '../../infrastructure/repositories/MediaRepository';
import { RankingService } from '../../domain/services/RankingService';
import type { MediaLink, StreamingEpisode } from '../../api/config';
import { useCloudViewModel } from '../view-models/CloudViewModel';
import { DeepRow } from './discovery/DeepRow';
import { TorrentRow } from './discovery/TorrentRow';
import { QuickServerRow } from './discovery/QuickServerRow';

interface DiscoveryPipelineProps {
  tmdbId: number;
  title: string;
  localizeTitle?: string;
  year?: string | number;
  mediaType: string;
  season?: number;
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
  { source_type: 'dailymotion', source: 'dailymotion'  },
] as const;

type SourceType = typeof DISCOVERY_SOURCES[number]['source_type'];
type LoadingKey = `${SourceType}:${string}`;

const SOURCE_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  m3u8:        { label: 'Stream',      color: 'text-orange-400',  icon: <Zap      className="w-3 h-3" /> },
  fshare:      { label: 'FShare',      color: 'text-red-400',     icon: <Box      className="w-3 h-3" /> },
  torrent:     { label: 'Torrent',     color: 'text-green-400',   icon: <Magnet   className="w-3 h-3" /> },
  gdrive:      { label: 'Drive',       color: 'text-purple-400',  icon: <Globe    className="w-3 h-3" /> },
  dailymotion: { label: 'Dailymotion', color: 'text-red-400',     icon: <Tv       className="w-3 h-3" /> },
};

const SOURCE_BADGE: Record<string, string> = {
  kkphim:       'KKPhim',
  ophim:        'OPhim',
  timfshareapi: 'TimFShare',
  timfsharehtml:'TimFShare',
  thuviencine:  'CineScan',
  googlesearch: 'GSearch',
  dailymotion:  'Dailymotion',
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
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  const streamingNotifiedRef = useRef<Set<string>>(new Set());

  const fetchSources = async (force = false) => {
    const ctrl = new AbortController();
    
    // 1. Reset states
    setStreamableByType({});
    setDownloadableByType({});
    setLoadingKeys(new Set(ALL_KEYS));
    setDoneKeys(new Set());
    setActiveTab('');
    streamingNotifiedRef.current = new Set();
    if (force) setIsForceRefreshing(true);

    const markDone = (key: LoadingKey) => {
      setLoadingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      setDoneKeys(prev    => { const n = new Set(prev); n.add(key);    return n; });
    };

    const isTV = mediaType === 'tv';
    const targetSeason = isTV ? (season ?? initialSeason) : undefined;
    const targetEpisode = isTV ? initialEpisode : undefined;

    // 2. Call the new Streaming API
    MediaRepository.discoverSourcesStream(
      {
        tmdb_id: tmdbId,
        media_type: mediaType,
        title,
        force,
        ...(localizeTitle ? { localize_title: localizeTitle } : {}),
        ...(year ? { year } : {}),
        ...(targetSeason ? { season: targetSeason } : {}),
        ...(targetEpisode ? { episode: targetEpisode } : {}),
      },
      {
        onInit: (_total, _sources) => {
          // Optional: dynamically set loading keys based on 'sources' array from backend
          // For now, ALL_KEYS is fine since both sides use DISCOVERY_SOURCES
        },
        onResult: (source_type, source, items, error) => {
          const key = toKey(source_type, source);

          if (error || !items || items.length === 0) {
            if (error) console.error(`[Discovery] Streaming failure for ${key}:`, error);
            markDone(key);
            return;
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
              const flat = items.flatMap((g: any) =>
                (g.episodes ?? []).map((ep: StreamingEpisode) => ({ 
                  ...ep, 
                  server: g.server, 
                  source_type, 
                  source 
                }))
              );
              if (onStreamingReady) onStreamingReady(flat, source);
            }
          } else {
            setDownloadableByType(prev => {
              const existing = prev[source_type] ?? [];
              const existingUrls = new Set(existing.map((l: MediaLink) => l.url));
              const fresh = items.filter((l: MediaLink) => l.url && !existingUrls.has(l.url));
              if (fresh.length === 0) return prev;
              const combined = [...existing, ...fresh];
              return { ...prev, [source_type]: RankingService.sortMediaLinks(combined) };
            });
          }
          markDone(key);
        },
        onDone: () => {
          setIsForceRefreshing(false);
          setLoadingKeys(new Set()); // Ensure we don't spin forever if a source silently fails
        },
        onError: (_err) => {
          setIsForceRefreshing(false);
          setLoadingKeys(new Set());
        }
      },
      ctrl.signal
    );

    return () => ctrl.abort();
  };

  useEffect(() => {
    fetchSources(false);
  }, [tmdbId, title, localizeTitle, year, mediaType, season, initialSeason, initialEpisode]);

  const tabs = ['m3u8', 'fshare', 'torrent', 'gdrive', 'dailymotion'].flatMap(st => {
    const isStreamable = st === 'm3u8';
    const hasResults   = isStreamable ? !!streamableByType[st] : !!downloadableByType[st];
    const isLoadingType = DISCOVERY_SOURCES.filter(d => d.source_type === st).some(d => loadingKeys.has(toKey(d.source_type, d.source)));
    if (!hasResults && !isLoadingType) return [];
    const meta  = SOURCE_TYPE_META[st] || { label: st, color: 'text-sky-400', icon: <Box className="w-3 h-3" /> };
    const count = isStreamable ? Object.keys(streamableByType[st] ?? {}).length : (downloadableByType[st] ?? []).length;
    const badge = isStreamable ? (count > 0 ? `${count} sv` : '…') : String(count);
    return [{ id: st, label: meta.label, icon: meta.icon, color: meta.color, badge, isLoading: isLoadingType }];
  });

  useLayoutEffect(() => {
    if (tabs.length > 0 && (!activeTab || !tabs.find(t => t.id === activeTab))) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const m3u8Groups: { src: string; entries: [string, any[]][] }[] = [];
  for (const [serverName, eps] of Object.entries(streamableByType['m3u8'] ?? {})) {
    const src = (eps[0] as any)?.source ?? '_';
    const group = m3u8Groups.find(g => g.src === src);
    if (group) group.entries.push([serverName, eps]);
    else m3u8Groups.push({ src, entries: [[serverName, eps]] });
  }

  return (
    <div className="glass-dark p-6 rounded-[2.5rem] border border-blue-500/10 space-y-4 relative overflow-hidden shadow-xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-2">
        <div className="flex items-center gap-3">
          <Activity className={`w-4 h-4 ${loadingKeys.size > 0 ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
          
          {/* Force Refresh Button */}
          <button 
            onClick={() => fetchSources(true)}
            disabled={loadingKeys.size > 0}
            className={`ml-2 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 transition-all group ${loadingKeys.size > 0 ? 'opacity-30 cursor-not-allowed' : ''}`}
            title="Force re-scan all sources (bypass cache)"
          >
            <RefreshCw className={`w-3 h-3 text-gray-500 group-hover:text-blue-400 transition-colors ${isForceRefreshing ? 'animate-spin text-blue-500' : ''}`} />
          </button>
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end max-w-[120px]">
          {ALL_KEYS.map(key => (
            <div key={key} title={key} className={`w-1 h-1 rounded-full transition-all duration-500 ${
              doneKeys.has(key)    ? 'bg-green-500 shadow-[0_0_4px_#22c55e]' :
              loadingKeys.has(key) ? 'bg-blue-500 animate-pulse shadow-[0_0_4px_#3b82f6]' : 'bg-white/5'
            }`} />
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap min-h-[36px]">
        {tabs.map(tab => {
          const isActive = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                isActive
                  ? `bg-white/10 border-white/20 ${tab.color}`
                  : 'bg-white/5 text-gray-500 border-transparent hover:bg-white/8 hover:text-gray-300'
              }`}>
              <span className={isActive ? tab.color : 'text-gray-600'}>{tab.icon}</span>
              {tab.label}
              <span className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[7px] font-black ${
                isActive ? 'bg-white/15 text-white' : 'bg-white/8 text-gray-500'
              }`}>
                {tab.badge}
                {tab.isLoading && <Loader2 className="w-2 h-2 animate-spin" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-[56px] animate-cinema-fade" key={activeTab}>
        {activeTab === 'm3u8' && m3u8Groups.length > 0 && (
          <div className="space-y-3">
            {m3u8Groups.map(({ src, entries }) => (
                <div key={src} className="space-y-1">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${
                    src === 'kkphim' ? 'text-blue-400 border-blue-500/20 bg-blue-500/5' : 'text-pink-400 border-pink-500/20 bg-pink-500/5'
                  }`}>
                    <Globe className="w-2.5 h-2.5 shrink-0" />
                    <span className="text-[8px] font-black uppercase tracking-[0.25em] flex-1">
                      {SOURCE_BADGE[src] ?? src.toUpperCase()}
                    </span>
                    <span className="text-[7px] font-bold opacity-50">{entries.length} sv</span>
                  </div>
                  {entries.map(([serverName, eps]) => (
                    <QuickServerRow key={serverName} serverName={serverName} episodes={eps}
                      color={src === 'kkphim' ? 'text-blue-400' : 'text-pink-400'} cloudTargets={cloudTargets}
                      sourceBadge={SOURCE_BADGE[eps[0]?.source]} />
                  ))}
                </div>
            ))}
          </div>
        )}

        {activeTab !== 'm3u8' && downloadableByType[activeTab] && (
          <div className="space-y-1">
            {downloadableByType[activeTab].map((l, i) => (
              activeTab === 'torrent'
                ? <TorrentRow key={i} link={l as any} sourceBadge={SOURCE_BADGE[(l as any).source]} />
                : <DeepRow key={i} link={l}
                    actionLabel={activeTab === 'gdrive' ? 'Drive' : activeTab === 'dailymotion' ? 'Watch' : 'FShare'}
                    color={SOURCE_TYPE_META[activeTab]?.color || 'text-sky-400'}
                    sourceBadge={SOURCE_BADGE[(l as any).source]}
                    onAction={(url) => window.open(url, '_blank')}
                  />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
