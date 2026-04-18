import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { Loader2, HardDrive, Activity, Zap, Magnet, Globe, Download, ExternalLink, ChevronDown, Server, Box, Cloud, Search, Tv, Users, File, Play } from 'lucide-react';
import { api } from '../api/config';
import type { MediaLink } from '../api/config';
import { useCloudTargets } from '../hooks/useCloudTargets';
import type { CloudTarget } from '../services/cloudTargets';
import { useMovieDetail } from './detail/MovieDetailContext';

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

// ── Discovery source registry ─────────────────────────────────────────────────
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

// ── Source type display meta ──────────────────────────────────────────────────
const SOURCE_TYPE_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  m3u8:        { label: 'Stream',      color: 'text-orange-400',  icon: <Zap      className="w-3 h-3" /> },
  fshare:      { label: 'FShare',      color: 'text-red-400',     icon: <Search   className="w-3 h-3" /> },
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
  brave:        'Brave',
  duckduckgo:   'DDG',
  searxng:      'SearXNG',
  google:       'Google',
  solid:        'SolidTorrent',
  apibay:       'APIBay',
  yts:          'YTS',
  googlesearch: 'GSearch',
  dailymotion:  'Dailymotion',
};

const stMeta = (st: string) =>
  SOURCE_TYPE_META[st] ?? { label: st, color: 'text-sky-400', icon: <Box className="w-3 h-3" /> };

const toKey = (st: string, src: string): LoadingKey => `${st}:${src}` as LoadingKey;
const ALL_KEYS: LoadingKey[] = DISCOVERY_SOURCES.map(d => toKey(d.source_type, d.source));

// ── Sorting helper ────────────────────────────────────────────────────────────
const QUALITY_RANK: Record<string, number> = {
  '4K': 0, '2160P': 0, 'REMUX': 1, '1080P': 2, '720P': 3, 'HD': 4, 'MHD': 5, 'SD': 6, 'CAM': 7
};

function sortMediaLinks(links: any[]) {
  return [...links].sort((a, b) => {
    const aIsFolder = a.is_folder || a.url?.includes('/folder/') || a.url?.includes('/folders/');
    const bIsFolder = b.is_folder || b.url?.includes('/folder/') || b.url?.includes('/folders/');
    if (aIsFolder && !bIsFolder) return -1;
    if (!aIsFolder && bIsFolder) return 1;

    const aQ = (a.quality || 'HD').toUpperCase();
    const bQ = (b.quality || 'HD').toUpperCase();
    const aRank = QUALITY_RANK[aQ] ?? 10;
    const bRank = QUALITY_RANK[bQ] ?? 10;
    if (aRank !== bRank) return aRank - bRank;

    return (a.name || '').localeCompare(b.name || '');
  });
}

export const DiscoveryPipeline = ({
  tmdbId, title, localizeTitle, year, mediaType, season, initialSeason, initialEpisode, onStreamingReady,
}: DiscoveryPipelineProps) => {
  const cloudTargets = useCloudTargets();
  const { userSettings } = useMovieDetail();
  const preferredSource = (userSettings as any)?.preferred_source || 'auto';

  const [streamableByType, setStreamableByType] = useState<Record<string, Record<string, any[]>>>({});
  const [downloadableByType, setDownloadableByType] = useState<Record<string, MediaLink[]>>({});

  const [loadingKeys, setLoadingKeys] = useState<Set<LoadingKey>>(new Set());
  const [doneKeys,    setDoneKeys]    = useState<Set<LoadingKey>>(new Set());
  const [activeTab,   setActiveTab]   = useState<string>('');
  const streamingNotifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();

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

    const fetchSource = async (sourceConfig: { source_type: string, source: string }) => {
      const { source_type, source } = sourceConfig;
      const key = toKey(source_type, source);
      try {
        const isTV = mediaType === 'tv';
        const targetSeason = isTV ? (season ?? initialSeason) : undefined;
        const targetEpisode = isTV ? initialEpisode : undefined;

        const params = new URLSearchParams({
          tmdb_id:     String(tmdbId),
          media_type:  mediaType,
          title,
          ...(localizeTitle ? { localize_title: localizeTitle } : {}),
          ...(year           ? { year: String(year) }           : {}),
          ...(targetSeason   ? { season: String(targetSeason) } : {}),
          ...(targetEpisode  ? { episode: String(targetEpisode) } : {}),
          source_type,
          source,
        });

        const res = await api.get<{ results: any[]; source_type: string; source: string }>(
          `/media/discovery?${params}`,
          { signal: ctrl.signal }
        );

        const items = res.data?.results ?? [];
        if (items.length === 0) {
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
              (g.episodes ?? []).map((ep: any) => ({
                ...ep,
                server: g.server,
                source_type,
                source
              }))
            );
            onStreamingReady?.(flat, source);
          }
        } else {
          setDownloadableByType(prev => {
            const existing = prev[source_type] ?? [];
            const existingUrls = new Set(existing.map((l: any) => l.url));
            const fresh = items.filter((l: any) => l.url && !existingUrls.has(l.url));
            if (fresh.length === 0) return prev;
            const combined = [...existing, ...fresh];
            return { ...prev, [source_type]: sortMediaLinks(combined) };
          });
        }

        markDone(key);
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        markDone(key);
      }
    };

    if (preferredSource === 'auto') {
      DISCOVERY_SOURCES.forEach(sourceConfig => {
        fetchSource(sourceConfig);
      });
    } else {
      const preferredEntry = DISCOVERY_SOURCES.find(d => d.source === preferredSource);
      const otherEntries = DISCOVERY_SOURCES.filter(d => d.source !== preferredSource);
      const queue = preferredEntry ? [preferredEntry, ...otherEntries] : [...DISCOVERY_SOURCES];

      (async () => {
        for (const sc of queue) {
          if (ctrl.signal.aborted) break;
          await fetchSource(sc);
        }
      })();
    }

    return () => ctrl.abort();
  }, [tmdbId, title, localizeTitle, year, mediaType, season, preferredSource, onStreamingReady]);

  const typeLoading = (st: string) =>
    DISCOVERY_SOURCES.filter(d => d.source_type === st).some(d => loadingKeys.has(toKey(d.source_type, d.source)));

  const SOURCE_TYPE_ORDER: SourceType[] = ['m3u8', 'fshare', 'torrent', 'gdrive', 'dailymotion'];

  const tabs = SOURCE_TYPE_ORDER.flatMap(st => {
    const isStreamable = st === 'm3u8';
    const hasResults   = isStreamable ? !!streamableByType[st] : !!downloadableByType[st];
    const loading      = typeLoading(st);
    if (!hasResults && !loading) return [];

    const meta  = stMeta(st);
    const count = isStreamable
      ? Object.keys(streamableByType[st] ?? {}).length
      : (downloadableByType[st] ?? []).length;
    const badge = isStreamable ? (count > 0 ? `${count} sv` : '…') : String(count);

    return [{ id: st, label: meta.label, icon: meta.icon, color: meta.color, badge, isLoading: loading }];
  });

  const isLoading = loadingKeys.size > 0;
  const allDone   = loadingKeys.size === 0;

  useEffect(() => {
    if (tabs.length > 0 && (!activeTab || !tabs.find(t => t.id === activeTab))) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs.map(t => t.id).join(',')]);

  const pendingSources = (st: string) =>
    DISCOVERY_SOURCES.filter(d => d.source_type === st && loadingKeys.has(toKey(d.source_type, d.source)))
      .map(d => SOURCE_BADGE[d.source] ?? d.source);

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
          <Activity className={`w-4 h-4 ${isLoading ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
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
        {tabs.length === 0 && isLoading && (
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-600">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500/60" />
            Scanning sources…
          </div>
        )}
        {tabs.length === 0 && allDone && (
          <div className="text-[9px] font-black uppercase tracking-widest text-gray-600">No sources found</div>
        )}

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
            {m3u8Groups.map(({ src, entries }) => {
              const srcCls = src === 'kkphim'
                ? 'text-blue-400 border-blue-500/20 bg-blue-500/5'
                : src === 'ophim'
                ? 'text-pink-400 border-pink-500/20 bg-pink-500/5'
                : 'text-sky-400 border-sky-500/20 bg-sky-500/5';
              return (
                <div key={src} className="space-y-1">
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border ${srcCls}`}>
                    <Globe className="w-2.5 h-2.5 shrink-0" />
                    <span className="text-[8px] font-black uppercase tracking-[0.25em] flex-1">
                      {SOURCE_BADGE[src] ?? src.toUpperCase()}
                    </span>
                    <span className="text-[7px] font-bold opacity-50">{entries.length} sv</span>
                  </div>
                  {entries.map(([serverName, eps]) => (
                    <QuickServerRow key={serverName} serverName={serverName} episodes={eps}
                      color={srcCls.split(' ')[0]} cloudTargets={cloudTargets} />
                  ))}
                </div>
              );
            })}
          </div>
        )}
        {activeTab === 'm3u8' && m3u8Groups.length === 0 && typeLoading('m3u8') && (
          <LoadingHint sources={pendingSources('m3u8')} />
        )}

        {activeTab !== 'm3u8' && downloadableByType[activeTab] && (
          <div className="space-y-1">
            {downloadableByType[activeTab].map((l, i) => (
              activeTab === 'torrent'
                ? <TorrentRow key={i} link={l as any} />
                : <DeepRow key={i} link={l}
                    actionLabel={activeTab === 'gdrive' ? 'Drive' : activeTab === 'dailymotion' ? 'Watch' : 'FShare'}
                    color={stMeta(activeTab).color}
                    onAction={(url) => window.open(url, '_blank')}
                  />
            ))}
            {typeLoading(activeTab) && (
              <div className="flex items-center gap-2 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-gray-600">
                <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />
                {pendingSources(activeTab).join(', ')}…
              </div>
            )}
          </div>
        )}
        {activeTab !== 'm3u8' && !downloadableByType[activeTab] && typeLoading(activeTab) && (
          <LoadingHint sources={pendingSources(activeTab)} />
        )}
      </div>
    </div>
  );
};

function LoadingHint({ sources }: { sources: string[] }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-[8px] font-black uppercase tracking-widest text-gray-600">
      <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />
      {sources.join(', ')}…
    </div>
  );
}

function CloudIcon({ icon, cls }: { icon: CloudTarget['icon']; cls?: string }) {
  const c = cls ?? 'w-2.5 h-2.5';
  if (icon === 'server')     return <Server    className={c} />;
  if (icon === 'hard-drive') return <HardDrive className={c} />;
  if (icon === 'box')        return <Box       className={c} />;
  if (icon === 'globe')      return <Globe     className={c} />;
  return <Cloud className={c} />;
}

function CloudButtons({ targets, count, compact = false }: {
  targets: CloudTarget[]; count?: number; compact?: boolean;
}) {
  const label = (t: CloudTarget) => count ? `${t.label} (${count})` : t.label;
  const px    = compact ? 'px-2 py-1' : 'px-3 py-1.5';

  if (targets.length === 0) {
    return (
      <button title="Send to cloud"
        className={`flex items-center gap-1.5 ${px} rounded-lg bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300 transition-all text-[8px] font-black uppercase tracking-widest`}>
        <Cloud className="w-2.5 h-2.5" />
        {!compact && (count ? `Cloud (${count})` : 'Cloud')}
      </button>
    );
  }

  return (
    <>
      {targets.map(t => (
        <button key={t.id} title={`Send to ${t.label}`}
          className={`flex items-center gap-1.5 ${px} rounded-lg border transition-all text-[8px] font-black uppercase tracking-widest ${t.bgColor} ${t.color}`}>
          <CloudIcon icon={t.icon} />
          {!compact && label(t)}
        </button>
      ))}
    </>
  );
}

function QuickServerRow({ serverName, episodes, color = 'text-orange-400', cloudTargets }: {
  serverName: string; episodes: any[]; color?: string; cloudTargets: CloudTarget[];
}) {
  const [open,     setOpen]     = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [focusIndex, setFocusIndex] = useState(0);
  const [rangeAnchor, setRangeAnchor] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  type SeasonGroupItem = { ep: any; index: number };
  type SeasonGroup = { season: number; items: SeasonGroupItem[] };

  const seasonGroups = episodes.reduce<SeasonGroup[]>((acc, ep, index) => {
    const rawSeason = Number(ep?.season);
    const season = Number.isFinite(rawSeason) && rawSeason > 0 ? rawSeason : 1;
    const entry = { ep, index };
    const existing = acc.find(group => group.season === season);
    if (existing) existing.items.push(entry);
    else acc.push({ season, items: [entry] });
    return acc;
  }, [])
    .sort((a, b) => a.season - b.season);

  const hasSeasonMetadata = episodes.some((ep) => Number.isFinite(Number(ep?.season)) && Number(ep?.season) > 0);

  const toggleEp  = (i: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });
  const toggleAll = () =>
    setSelected(prev => prev.size === episodes.length ? new Set() : new Set(episodes.map((_, i) => i)));

  const selectRange = (from: number, to: number) => {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    setSelected(prev => {
      const next = new Set(prev);
      for (let i = start; i <= end; i += 1) next.add(i);
      return next;
    });
  };

  const handleEpisodePointerSelect = (index: number, e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.shiftKey) {
      const anchor = rangeAnchor ?? focusIndex ?? index;
      selectRange(anchor, index);
      setFocusIndex(index);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        if (next.has(index)) next.delete(index);
        else next.add(index);
        return next;
      });
      setRangeAnchor(index);
      setFocusIndex(index);
    }
  };

  const handleEpisodeClick = (index: number, e: ReactMouseEvent<HTMLButtonElement>) => {
    if (e.shiftKey) {
      const anchor = rangeAnchor ?? focusIndex ?? index;
      selectRange(anchor, index);
      setFocusIndex(index);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      toggleEp(index);
      setRangeAnchor(index);
      setFocusIndex(index);
      return;
    }

    toggleEp(index);
    setRangeAnchor(index);
    setFocusIndex(index);
  };

  const handleGridKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!open || episodes.length === 0) return;
    const columns = 4;
    let nextIndex = focusIndex;

    if (e.key === 'ArrowRight') nextIndex = Math.min(episodes.length - 1, focusIndex + 1);
    else if (e.key === 'ArrowLeft') nextIndex = Math.max(0, focusIndex - 1);
    else if (e.key === 'ArrowDown') nextIndex = Math.min(episodes.length - 1, focusIndex + columns);
    else if (e.key === 'ArrowUp') nextIndex = Math.max(0, focusIndex - columns);
    else return;

    e.preventDefault();
    setFocusIndex(nextIndex);

    if (e.shiftKey) {
      const anchor = rangeAnchor ?? focusIndex;
      selectRange(anchor, nextIndex);
      return;
    }

    if (e.ctrlKey || e.metaKey) {
      setSelected(prev => {
        const next = new Set(prev);
        next.add(nextIndex);
        return next;
      });
      setRangeAnchor(nextIndex);
    }
  };

  useEffect(() => {
    if (!open) return;
    setFocusIndex(prev => Math.min(prev, Math.max(episodes.length - 1, 0)));
  }, [open, episodes.length]);

  const allSelected = selected.size === episodes.length && episodes.length > 0;
  const selectMode  = selected.size > 0;

  const srcLabel = SOURCE_BADGE[episodes[0]?.source] ?? null;

  return (
    <div className={`rounded-xl border transition-all overflow-hidden ${
      open ? 'bg-white/5 border-white/10' : 'bg-black/30 border-white/5 hover:border-white/10'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
          <Globe className={`w-3 h-3 ${color} shrink-0`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 truncate">{serverName}</span>
          {srcLabel && (
            <span className="text-[6px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-white/5 text-gray-500 shrink-0">
              {srcLabel}
            </span>
          )}
          <span className="text-[9px] font-bold text-gray-600 shrink-0">
            ({episodes.length} tập{hasSeasonMetadata ? ` · ${seasonGroups.length} mùa` : ''})
          </span>
        </button>

        <div className="flex items-center gap-1.5 shrink-0">
          {open && (
            <button onClick={toggleAll}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest transition-all ${
                allSelected
                  ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                  : 'bg-white/5 text-gray-500 border-white/10 hover:text-gray-300'
              }`}>
              {allSelected ? 'Bỏ chọn' : 'Chọn tất cả'}
            </button>
          )}
          <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/8 text-gray-300 border border-white/10 hover:bg-white/15 transition-all text-[8px] font-black uppercase tracking-widest">
            <HardDrive className="w-2.5 h-2.5" />
            {selectMode ? `Device (${selected.size})` : 'Device'}
          </button>
          <CloudButtons targets={cloudTargets} count={selectMode ? selected.size : undefined} />
          <button onClick={() => setOpen(o => !o)} className="p-1 rounded-lg hover:bg-white/8 transition-all">
            <ChevronDown className={`w-3.5 h-3.5 text-gray-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-white/5 px-3 pb-3 pt-2 space-y-1.5 animate-cinema-fade">
          {seasonGroups.map(group => (
            <div key={group.season} className="space-y-1.5">
              {hasSeasonMetadata && (
                <div className="flex items-center gap-2 px-1 pt-1">
                  <span className={`text-[8px] font-black uppercase tracking-[0.25em] ${color}`}>
                    Mùa {group.season}
                  </span>
                  <span className="text-[7px] font-bold uppercase tracking-widest text-gray-600">
                    {group.items.length} tập
                  </span>
                  <button
                    onClick={() => {
                      const indices = group.items.map(item => item.index);
                      const isFullySelected = indices.every(i => selected.has(i));
                      setSelected(prev => {
                        const next = new Set(prev);
                        for (const i of indices) {
                          if (isFullySelected) next.delete(i);
                          else next.add(i);
                        }
                        return next;
                      });
                      if (indices.length > 0) {
                        setRangeAnchor(indices[0]);
                        setFocusIndex(indices[0]);
                      }
                    }}
                    className={`ml-auto px-2 py-1 rounded-md border text-[7px] font-black uppercase tracking-widest transition-all ${
                      group.items.every(item => selected.has(item.index))
                        ? 'bg-blue-600/20 text-blue-400 border-blue-500/30'
                        : 'bg-white/5 text-gray-500 border-white/10 hover:text-gray-300 hover:bg-white/8'
                    }`}
                  >
                    {group.items.every(item => selected.has(item.index)) ? 'Bỏ mùa' : 'Chọn mùa'}
                  </button>
                </div>
              )}

              <div
                ref={gridRef}
                tabIndex={0}
                onKeyDown={handleGridKeyDown}
                className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 outline-none"
              >
                {group.items.map(({ ep, index }) => {
                  const isSelected = selected.has(index);
                  const epLabel = ep.name || `Tập ${String(index + 1).padStart(2, '0')}`;
                  return (
                    <div key={`${group.season}-${index}`} className={`flex items-stretch rounded-lg border transition-all ${
                      isSelected ? 'bg-blue-600/20 border-blue-500/40' : 'bg-black/30 border-white/8 hover:border-white/15'
                    }`}>
                      <button
                        onClick={(e) => handleEpisodeClick(index, e)}
                        onMouseEnter={(e) => handleEpisodePointerSelect(index, e)}
                        className="flex-1 flex items-center gap-2 px-2.5 py-2 min-w-0 hover:bg-white/5 rounded-l-lg transition-all">
                        <div className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-all ${
                          isSelected ? 'bg-blue-500 border-blue-400' : 'border-white/20'
                        }`}>
                          {isSelected && <span className="text-[7px] text-white font-black leading-none">✓</span>}
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[9px] font-bold text-gray-300 truncate block">{epLabel}</span>
                        </div>
                      </button>
                      {!selectMode && (
                        <>
                          <button title="Device" className="px-1.5 flex items-center justify-center border-l border-white/5 hover:bg-white/10 transition-all group/dev">
                            <HardDrive className="w-2.5 h-2.5 text-gray-600 group-hover/dev:text-gray-300 transition-colors" />
                          </button>
                          {cloudTargets.length === 0 ? (
                            <button title="Cloud" className="px-1.5 flex items-center justify-center border-l border-white/5 hover:bg-white/10 transition-all rounded-r-lg group/cl">
                              <Cloud className="w-2.5 h-2.5 text-gray-600 group-hover/cl:text-gray-300 transition-colors" />
                            </button>
                          ) : cloudTargets.map((t, ti) => (
                            <button key={t.id} title={t.label}
                              className={`px-1.5 flex items-center justify-center border-l border-white/5 transition-all ${ti === cloudTargets.length - 1 ? 'rounded-r-lg' : ''} hover:bg-white/10 group/ct`}>
                              <span className={`text-gray-600 group-hover/ct:${t.color} transition-colors`}>
                                <CloudIcon icon={t.icon} />
                              </span>
                            </button>
                          ))}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeepRow({ link, actionLabel, color, onAction, depth = 0 }: { 
  link: MediaLink; 
  actionLabel: string; 
  color: string; 
  onAction?: (url: string, name: string) => void;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<any[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const src      = (link as any).source as string | undefined;
  const srcLabel = src ? (SOURCE_BADGE[src] ?? src) : null;
  const isFolder = link.is_folder || link.url?.includes('/folder/') || link.url?.includes('/folders/');

  const toggleFolder = async () => {
    if (!isFolder) return;
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (files !== null) return;
    
    setLoadingFiles(true);
    try {
      const provider = link.url?.includes('fshare.vn') ? 'fshare' : 'gdrive';
      const res = await api.get(`/media/expand-folder?url=${encodeURIComponent(link.url || '')}&provider=${provider}`);
      setFiles(res.data?.results || []);
    } catch {
      setFiles([]);
    }
    setLoadingFiles(false);
  };

  const formatDate = (ts: any) => {
    if (!ts) return null;
    try {
      const date = new Date(typeof ts === 'number' ? ts * 1000 : ts);
      return date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' });
    } catch { return null; }
  };

  return (
    <div className={`rounded-xl transition-all overflow-hidden ${depth === 0 ? 'bg-black/30 border border-white/5 hover:border-white/10' : 'border-l border-white/5 ml-4 my-1'}`}>
      <div className="flex items-center gap-3 px-3 py-2 group">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            {!isFolder ? <File className="w-2.5 h-2.5 text-gray-600" /> : <Box className="w-2.5 h-2.5 text-blue-500" />}
            <p className="text-[9px] font-bold text-gray-300 truncate group-hover:text-white transition-colors" title={link.name}>
              {link.name || 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 pl-4">
            {isFolder && (
              <span className="text-[7px] font-black text-blue-500/60 uppercase tracking-widest">Folder</span>
            )}
            {(link as any).size != null && (link as any).size > 0 && (
              <span className="text-[7px] font-bold text-gray-600 uppercase tracking-wider">{formatSize((link as any).size)}</span>
            )}
            {(link as any).updated_at && (
              <span className="text-[7px] font-bold text-gray-700 uppercase tracking-wider">{formatDate((link as any).updated_at)}</span>
            )}
            {srcLabel && depth === 0 && (
              <span className="text-[6px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-white/5 text-gray-600">
                {srcLabel}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isFolder && (
            <button onClick={toggleFolder}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-all">
              {loadingFiles ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />}
            </button>
          )}
          <button onClick={() => {
              if (link.url) {
                  if (onAction) onAction(link.url, link.name || '');
                  else window.open(link.url, '_blank');
              }
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/15 transition-all text-[8px] font-black uppercase tracking-widest ${color}`}>
            <Download className="w-2.5 h-2.5" />
            {isFolder ? 'Open' : actionLabel}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-1 py-1 bg-white/[0.02] animate-cinema-fade">
          {loadingFiles ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[8px] font-black uppercase tracking-widest text-gray-600">
              <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />Exploring transmission grid…
            </div>
          ) : files && files.length > 0 ? (
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {files.map((f, i) => (
                <DeepRow 
                  key={i} 
                  link={f} 
                  actionLabel={actionLabel} 
                  color={color} 
                  onAction={onAction} 
                  depth={depth + 1} 
                />
              ))}
            </div>
          ) : (
            <p className="text-[8px] text-gray-600 uppercase tracking-widest py-3 px-4 italic">No transmissions found in this node</p>
          )}
        </div>
      )}
    </div>
  );
}

interface TorrentLink {
  url: string; name: string; size?: number; seeders?: number; leechers?: number;
  quality?: string; num_files?: number; info_hash?: string; source?: string;
}

function estimateSpeed(seeders: number): string {
  const kbps = seeders * 120;
  if (kbps >= 1024 * 10) return `~${(kbps / 1024).toFixed(0)} MB/s`;
  if (kbps >= 1024) return `~${(kbps / 1024).toFixed(1)} MB/s`;
  return `~${kbps} KB/s`;
}

function SpeedBar({ seeders }: { seeders: number }) {
  const bars = seeders === 0 ? 0 : seeders < 10 ? 1 : seeders < 30 ? 2 : seeders < 60 ? 3 : seeders < 100 ? 4 : 5;
  const color = bars >= 4 ? 'bg-green-400' : bars >= 3 ? 'bg-blue-400' : bars >= 2 ? 'bg-yellow-400' : 'bg-red-400';
  const textColor = bars >= 4 ? 'text-green-400' : bars >= 3 ? 'text-blue-400' : bars >= 2 ? 'text-yellow-400' : 'text-red-400';
  return (
    <span className={`flex items-center gap-1.5 text-[7px] font-black uppercase tracking-wider ${textColor}`}>
      <span className="flex items-end gap-px h-3">
        {[1,2,3,4,5].map(b => (
          <span key={b} className={`w-1 rounded-sm transition-all ${b <= bars ? color : 'bg-white/10'}`}
            style={{ height: `${4 + b * 2}px` }} />
        ))}
      </span>
      {estimateSpeed(seeders)}
    </span>
  );
}

function SeederBadge({ count }: { count: number }) {
  const color = count >= 50 ? 'text-green-400' : count >= 10 ? 'text-yellow-400' : 'text-red-400';
  return (
    <span className={`flex items-center gap-1 text-[7px] font-black uppercase tracking-wider ${color}`}>
      <Users className="w-2.5 h-2.5" />
      {count}
    </span>
  );
}

function QualityBadge({ quality }: { quality: string }) {
  const color =
    quality === '4K' || quality === 'Remux' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
    quality === '1080p' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
    quality === '720p'  ? 'bg-green-500/20 text-green-300 border-green-500/30' :
    quality === 'CAM'   ? 'bg-red-500/20 text-red-300 border-red-500/30' :
    'bg-white/5 text-gray-400 border-white/10';
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[7px] font-black uppercase tracking-wider ${color}`}>
      {quality}
    </span>
  );
}

function TorrentRow({ link }: { link: TorrentLink }) {
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<{ name: string; size: number }[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const srcLabel = link.source ? (SOURCE_BADGE[link.source] ?? link.source.toUpperCase()) : null;
  const canExpand = (link.num_files ?? 0) > 1 && link.info_hash;

  const toggleFiles = async () => {
    if (!canExpand) return;
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (files !== null) return;
    setLoadingFiles(true);
    try {
      const res = await api.get(`/media/torrent-files?info_hash=${link.info_hash}`);
      setFiles(res.data?.files ?? []);
    } catch { setFiles([]); }
    setLoadingFiles(false);
  };

  return (
    <div className="rounded-xl bg-black/30 border border-white/5 hover:border-white/10 transition-all overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 group">
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-[9px] font-bold text-gray-300 truncate group-hover:text-white transition-colors" title={link.name}>
            {link.name}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {link.quality && <QualityBadge quality={link.quality} />}
            {link.size != null && link.size > 0 && (
              <span className="text-[7px] font-bold text-gray-500 uppercase tracking-wider">{formatSize(link.size)}</span>
            )}
            {link.seeders != null && (
              <>
                <SeederBadge count={link.seeders} />
                <SpeedBar seeders={link.seeders} />
              </>
            )}
            {link.leechers != null && (
              <span className="flex items-center gap-1 text-[7px] font-bold text-gray-600 uppercase tracking-wider">
                <Users className="w-2.5 h-2.5" />{link.leechers}↓
              </span>
            )}
            {srcLabel && (
              <span className="text-[6px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-white/5 text-gray-600">{srcLabel}</span>
            )}
            {canExpand && (
              <span className="flex items-center gap-1 text-[7px] font-bold text-gray-500 uppercase tracking-wider">
                <File className="w-2.5 h-2.5" />{link.num_files} files
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canExpand && (
            <button onClick={toggleFiles}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-all">
              <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          <button onClick={() => window.open(link.url, '_blank')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/15 transition-all text-[8px] font-black uppercase tracking-widest text-green-400">
            <Magnet className="w-2.5 h-2.5" />
            Magnet
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-3 py-2 space-y-1 animate-cinema-fade">
          {loadingFiles ? (
            <div className="flex items-center gap-2 py-1 text-[8px] font-black uppercase tracking-widest text-gray-600">
              <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />Fetching files…
            </div>
          ) : files && files.length > 0 ? (
            files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-1 border-b border-white/5 last:border-0">
                <span className="text-[8px] font-medium text-gray-400 truncate flex-1">{f.name}</span>
                <span className="text-[7px] font-bold text-gray-600 shrink-0">{formatSize(f.size)}</span>
              </div>
            ))
          ) : (
            <p className="text-[8px] text-gray-600 uppercase tracking-widest">No file data available</p>
          )}
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '';
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
}
