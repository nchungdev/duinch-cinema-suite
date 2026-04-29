import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { Loader2, Activity, Zap, Magnet, Globe, Box, Tv, RefreshCw } from 'lucide-react';
import { MediaRepository } from '../../infrastructure/repositories/MediaRepository';
import { RankingService } from '../../domain/services/RankingService';
import type { MediaLink, StreamingEpisode } from '../../api/config';
import { useCloudViewModel } from '../view-models/CloudViewModel';
import { DeepRow } from './discovery/DeepRow';
import { TorrentRow } from './discovery/TorrentRow';
import { QuickServerRow } from './discovery/QuickServerRow';
import { useDownloader } from '../hooks/useDownloader';
import { DownloadModal } from './discovery/DownloadModal';
import { HlsDownloaderModal } from './discovery/HlsDownloaderModal';
import { useDownloaderContext } from '../context/DownloaderContext';
import { useToast } from '../context/ToastContext';

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
] as const;

type SourceType = typeof DISCOVERY_SOURCES[number]['source_type'];
type LoadingKey = `${SourceType}:${string}`;

const SOURCE_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  m3u8:    { label: 'Stream',  color: 'text-orange-400', icon: <Zap      className="w-3 h-3" /> },
  fshare:  { label: 'FShare',  color: 'text-red-400',    icon: <Box      className="w-3 h-3" /> },
  torrent: { label: 'Torrent', color: 'text-green-400',  icon: <Magnet   className="w-3 h-3" /> },
  gdrive:  { label: 'Drive',   color: 'text-purple-400', icon: <Globe    className="w-3 h-3" /> },
};

const SOURCE_BADGE: Record<string, string> = {
  kkphim: 'KKPhim', 
  ophim: 'OPhim', 
  timfshare: 'TimFShare', 
  thuviencine: 'CineScan', 
  web: 'GSearch', 
  default: 'Torrent', 
  googlesearch: 'Drive'
};

const toKey = (st: string, src: string): LoadingKey => `${st}:${src}` as LoadingKey;
const ALL_KEYS: LoadingKey[] = DISCOVERY_SOURCES.map(d => toKey(d.source_type, d.source));

export const DiscoveryPipeline = ({
  tmdbId, title, localizeTitle, year, mediaType, season, initialSeason, initialEpisode, onStreamingReady,
}: DiscoveryPipelineProps) => {
  const cloudTargets = useCloudViewModel();
  const downloader = useDownloader();
  const jdStatus = useDownloaderContext();
  const { showToast } = useToast();

  const [streamableByType, setStreamableByType] = useState<Record<string, Record<string, any[]>>>({});
  const [downloadableByType, setDownloadableByType] = useState<Record<string, MediaLink[]>>({});

  const [loadingKeys, setLoadingKeys] = useState<Set<LoadingKey>>(new Set());
  const [doneKeys,    setDoneKeys]    = useState<Set<LoadingKey>>(new Set());
  const [activeTab,   setActiveTab]   = useState<string>('');
  const [isForceRefreshing, setIsForceRefreshing] = useState(false);
  
  const streamingNotifiedRef = useRef<Set<string>>(new Set());
  const fetchLock = useRef<string | null>(null);

  // Automatic Download Logic
  const handleDownloadRequest = async (url: string, name: string) => {
    console.log('[DiscoveryPipeline] Automatic download request for:', name, url);
    
    // 1. Check JD Status
    const isJdOnline = await downloader.checkJDStatus();
    
    if (isJdOnline) {
        console.log('[DiscoveryPipeline] JD Online: Sending to JD...');
        const ok = await downloader.sendToJD(url, name);
        if (ok) {
            showToast(`Đã gửi tới JDownloader: ${name}`, 'success');
            return;
        } else {
            showToast(`Lỗi kết nối JDownloader. Tải bằng trình duyệt...`, 'error');
        }
    } else {
        showToast(`JDownloader (${jdStatus.activeDevice || 'Node'}) đang Offline. Tải bằng trình duyệt...`, 'info');
    }

    // 2. Fallback to direct browser download
    console.log('[DiscoveryPipeline] Falling back to direct browser download...');
    showToast(`Đang tải qua trình duyệt: ${name}`, 'success');
    downloader.downloadInBrowser(url, name);
  };

  const isTV = mediaType === 'tv';

  const fetchSources = async (force = false) => {
    // ── Single-Flight Lock ──
    const currentTaskKey = `${tmdbId}-${force}`;
    
    if (fetchLock.current === currentTaskKey) {
        return;
    }
    fetchLock.current = currentTaskKey;

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

    const targetEpisode = isTV ? initialEpisode : undefined;

    MediaRepository.discoverSourcesStream(
      {
        tmdb_id: tmdbId,
        media_type: mediaType,
        title,
        force,
        localize_title: localizeTitle,
        year: String(year || ''),
        season: undefined,
        episode: targetEpisode,
      },
      {
        onInit: (_total, _sources) => {},
        onResult: (source_type, source, items, error) => {
          const key = toKey(source_type, source);
          if (error || !items || (Array.isArray(items) && items.length === 0)) { 
            markDone(key); 
            return; 
          }

          if (source_type === 'm3u8') {
            const collections = items as any[];
            
            setStreamableByType(prev => {
              const next = { ...prev };
              const current = next['m3u8'] || {};
              next['m3u8'] = { ...current, [source]: collections };
              return next;
            });

            // Single Path Flattening: collections -> servers -> episodes
            const flat = collections.flatMap(collection => 
                (collection.servers ?? []).flatMap((srv: any) => 
                    (srv.episodes ?? []).map((st: any) => ({ 
                        ...st, 
                        source, 
                        server: srv.server_name,
                        audio_type: srv.audio_type,
                        season: collection.order, 
                        movie_name: collection.collection_name
                    }))
                )
            );
            
            if (flat.length > 0) onStreamingReady?.(flat, source);
          } else {
            const links = items as any[];
            
            setDownloadableByType(prev => {
              const existing = prev[source_type] ?? [];
              const existingUrls = new Set(existing.map((l: MediaLink) => l.url));
              const fresh = links.filter((l: MediaLink) => l.url && !existingUrls.has(l.url));
              if (fresh.length === 0) return prev;
              const combined = [...existing, ...fresh];
              return { ...prev, [source_type]: RankingService.sortMediaLinks(combined) };
            });
          }
          markDone(key);
        },
        onDone: () => {
          setIsForceRefreshing(false);
          setLoadingKeys(new Set());
          fetchLock.current = null;
        },
        onError: (_err) => {
          setIsForceRefreshing(false);
          setLoadingKeys(new Set());
          fetchLock.current = null;
        }
      },
      ctrl.signal
    );

    return () => { ctrl.abort(); fetchLock.current = null; };
  };

  useEffect(() => {
    fetchSources(false);
  }, [tmdbId]);

  const tabs = ['m3u8', 'fshare', 'torrent', 'gdrive'].flatMap(st => {
    const isStreamable = st === 'm3u8';
    const hasResults   = isStreamable ? !!streamableByType[st] : !!downloadableByType[st];
    const loading      = DISCOVERY_SOURCES.filter(d => d.source_type === st).some(d => loadingKeys.has(toKey(d.source_type, d.source)));
    if (!hasResults && !loading) return [];

    const meta  = SOURCE_TYPE_META[st] || { label: st, color: 'text-orange-400', icon: <Box className="w-3 h-3" /> };
    let count = 0;
    if (isStreamable) {
        const allServers = new Set();
        Object.values(streamableByType[st] ?? {}).forEach((items: any) => {
            if (isTV) {
                items.forEach((s: any) => s.servers.forEach((srv: any) => allServers.add(srv.server)));
            } else {
                items.forEach((srv: any) => allServers.add(srv.server));
            }
        });
        count = allServers.size;
    } else {
        count = (downloadableByType[st] ?? []).length;
    }
    const badge = isStreamable ? (count > 0 ? `${count} sv` : '…') : String(count);
    return [{ id: st, label: meta.label, icon: meta.icon, color: meta.color, badge, isLoading: loading }];
  });

  useLayoutEffect(() => {
    if (tabs.length > 0 && (!activeTab || !tabs.find(t => t.id === activeTab))) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs, activeTab]);

  const renderM3U8Content = () => {
    const sources = streamableByType['m3u8'] ?? {};
    const collectionsMap: Record<string, { meta: any, servers: any[] }> = {};
    
    // Group all collections from all sources by their name/order
    // Group all collections from all sources by their name/order
    Object.entries(sources).forEach(([sourceKey, collections]: [string, any]) => {
        (collections || []).forEach((col: any) => {
            const groupKey = col.collection_name || `col_${col.order}`;
            if (!collectionsMap[groupKey]) {
                collectionsMap[groupKey] = { meta: col, servers: [] };
            }
            (col.servers || []).forEach((srv: any) => {
                collectionsMap[groupKey].servers.push({ 
                  ...srv, 
                  source: sourceKey,
                  episodes: srv.episodes || srv.server_data || []
                });
            });
        });
    });

    const sortedGroups = Object.values(collectionsMap).sort((a, b) => a.meta.order - b.meta.order);

    return (
        <div className="space-y-6">
            {sortedGroups.map(group => (
                <div key={group.meta.id} className="space-y-2">
                    {/* Only show header if it's not a single "Bản Chính" movie group or if we have multiple collections */}
                    {(sortedGroups.length > 1 || (group.meta.collection_name && group.meta.collection_name !== 'Bản Chính')) && (
                        <div className="flex items-center gap-3 px-2">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
                                <Tv className="w-4 h-4 text-blue-400" />
                            </div>
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-widest text-white/90">
                                    {group.meta.collection_name}
                                </h4>
                            </div>
                            <div className="flex-1 h-px bg-gradient-to-r from-blue-500/20 to-transparent ml-2" />
                        </div>
                    )}
                    
                    <div className="grid gap-2">
                        {group.servers.map((srv, idx) => (
                            <QuickServerRow 
                                key={`${srv.source}-${srv.server_name}-${idx}`} 
                                serverName={srv.server_name} 
                                audioType={srv.audio_type}
                                episodes={srv.episodes} 
                                color={srv.source === 'kkphim' ? 'text-blue-400' : 'text-pink-400'} 
                                cloudTargets={cloudTargets}
                                sourceBadge={SOURCE_BADGE[srv.source]} 
                                onBrowserDownload={(url, name) => handleDownloadRequest(url, name)}
                                onCloudDownload={(url, name) => handleDownloadRequest(url, name)}
                                isJdOnline={jdStatus.isJdOnline} 
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
  };

  return (
    <div className="glass-dark p-6 rounded-[2.5rem] border border-blue-500/10 space-y-4 relative overflow-hidden shadow-xl">
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-2">
        <div className="flex items-center gap-3">
          <Activity className={`w-4 h-4 ${loadingKeys.size > 0 ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
          
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
            <div key={key} title={key} className={`w-1.5 h-1.5 rounded-full transition-all duration-500 ${
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
                {tab.isLoading && <Loader2 className="w-2 h-2 animate-spin ml-1" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-[56px] animate-cinema-fade" key={activeTab}>
        {activeTab === 'm3u8' && renderM3U8Content()}

        {activeTab !== 'm3u8' && downloadableByType[activeTab] && (
          <div className="space-y-1">
                {downloadableByType[activeTab].map((l, i) => (
              activeTab === 'torrent'
                ? <TorrentRow key={i} link={l as any} sourceBadge={SOURCE_BADGE[(l as any).source]} 
                    onBrowserDownload={(url, name) => handleDownloadRequest(url, name)}
                    onCloudDownload={(url, name) => handleDownloadRequest(url, name)}
                    isJdOnline={jdStatus.isJdOnline} />
                : <DeepRow key={i} link={l}
                    actionLabel={activeTab === 'gdrive' ? 'Drive' : 'FShare'}
                    color={SOURCE_TYPE_META[activeTab]?.color || 'text-sky-400'}
                    sourceBadge={SOURCE_BADGE[(l as any).source]}
                    onBrowserAction={(url, name) => handleDownloadRequest(url, name)}
                    onCloudAction={(url, name) => handleDownloadRequest(url, name)}
                    isJdOnline={jdStatus.isJdOnline}
                  />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
