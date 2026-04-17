import { useState, useEffect } from 'react';
import { Loader2, HardDrive, Activity, Zap, Magnet, Globe, Download, ExternalLink, ChevronDown, Server, Box, Cloud, Search, Tv } from 'lucide-react';
import { api } from '../api/config';
import type { MediaLink } from '../api/config';
import { useCloudTargets } from '../hooks/useCloudTargets';
import type { CloudTarget } from '../services/cloudTargets';

interface DiscoveryPipelineProps {
  tmdbId: number;
  title: string;
  localizeTitle?: string;
  year?: string | number;
  mediaType: string;
  season?: number;
  onStreamingReady?: (links: any[], source: string) => void;
}

// ── Discovery source registry ─────────────────────────────────────────────────
// Each entry is one independent API request: source_type + source.
// Frontend fires all in parallel; results accumulate per source_type tab.
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

// Labels for the `source` field on each result item (for display badge)
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

// ── Loading key helpers ───────────────────────────────────────────────────────
const toKey = (st: string, src: string): LoadingKey => `${st}:${src}` as LoadingKey;
const ALL_KEYS: LoadingKey[] = DISCOVERY_SOURCES.map(d => toKey(d.source_type, d.source));

export const DiscoveryPipeline = ({
  tmdbId, title, localizeTitle, year, mediaType, season, onStreamingReady,
}: DiscoveryPipelineProps) => {
  const cloudTargets = useCloudTargets();

  // m3u8: source_type → { serverName → episodes[] }
  const [streamableByType, setStreamableByType] = useState<Record<string, Record<string, any[]>>>({});
  // non-m3u8 downloadable: source_type → items[]
  const [downloadableByType, setDownloadableByType] = useState<Record<string, MediaLink[]>>({});

  const [loadingKeys, setLoadingKeys] = useState<Set<LoadingKey>>(new Set());
  const [doneKeys,    setDoneKeys]    = useState<Set<LoadingKey>>(new Set());
  const [activeTab,   setActiveTab]   = useState<string>('');
  const [, setStreamingNotified] = useState<Set<string>>(new Set());

  useEffect(() => {
    const ctrl = new AbortController();

    setStreamableByType({});
    setDownloadableByType({});
    setLoadingKeys(new Set(ALL_KEYS));
    setDoneKeys(new Set());
    setActiveTab('');
    setStreamingNotified(new Set());

    let firstSettledTab = '';

    const markDone = (key: LoadingKey) => {
      setLoadingKeys(prev => { const n = new Set(prev); n.delete(key); return n; });
      setDoneKeys(prev    => { const n = new Set(prev); n.add(key);    return n; });
    };

    DISCOVERY_SOURCES.forEach(async ({ source_type, source }) => {
      const key = toKey(source_type, source);
      try {
        const params = new URLSearchParams({
          tmdb_id:     String(tmdbId),
          media_type:  mediaType,
          title,
          ...(localizeTitle ? { localize_title: localizeTitle } : {}),
          ...(year           ? { year: String(year) }           : {}),
          ...(season         ? { season: String(season) }       : {}),
          source_type,
          source,
        });

        const res = await api.get<{ results: any[]; source_type: string; source: string }>(
          `/media/discovery?${params}`,
          { signal: ctrl.signal }
        );

        const items = res.data?.results ?? [];
        if (items.length === 0) { markDone(key); return; }

        if (source_type === 'm3u8') {
          // items = [{server, episodes:[]}] — already grouped by backend
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

          // Notify MovieDetail for player — flatten grouped [{server,episodes}] back to flat list
          // Re-attach server name to each episode so MovieDetail can re-group correctly
          setStreamingNotified(prev => {
            if (prev.has(source)) return prev;
            const flat = items.flatMap((g: any) =>
              (g.episodes ?? []).map((ep: any) => ({ ...ep, server: g.server }))
            );
            onStreamingReady?.(flat, source);
            return new Set(prev).add(source);
          });

          if (!firstSettledTab) { firstSettledTab = 'm3u8'; setActiveTab('m3u8'); }
        } else {
          // Downloadable: append deduped items to source_type bucket
          setDownloadableByType(prev => {
            const existing = prev[source_type] ?? [];
            const existingUrls = new Set(existing.map((l: any) => l.url));
            const fresh = items.filter((l: any) => l.url && !existingUrls.has(l.url));
            if (fresh.length === 0) return prev;
            return { ...prev, [source_type]: [...existing, ...fresh] };
          });
          if (!firstSettledTab) { firstSettledTab = source_type; setActiveTab(source_type); }
        }

        markDone(key);
      } catch (err: any) {
        if (err.name === 'CanceledError' || err.name === 'AbortError') return;
        markDone(key);
      }
    });

    return () => ctrl.abort();
  }, [tmdbId, title, localizeTitle, year, mediaType, season]);

  // ── Derived loading state per source_type ─────────────────────────────────
  const typeLoading = (st: string) =>
    DISCOVERY_SOURCES.filter(d => d.source_type === st).some(d => loadingKeys.has(toKey(d.source_type, d.source)));

  // ── Build tabs ────────────────────────────────────────────────────────────
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

  // Pending sub-sources for a source_type (for in-tab loading hint)
  const pendingSources = (st: string) =>
    DISCOVERY_SOURCES.filter(d => d.source_type === st && loadingKeys.has(toKey(d.source_type, d.source)))
      .map(d => SOURCE_BADGE[d.source] ?? d.source);

  // Group m3u8 server rows by source (kkphim / ophim / …)
  const m3u8Groups: { src: string; entries: [string, any[]][] }[] = [];
  for (const [serverName, eps] of Object.entries(streamableByType['m3u8'] ?? {})) {
    const src = (eps[0] as any)?.source ?? '_';
    const group = m3u8Groups.find(g => g.src === src);
    if (group) group.entries.push([serverName, eps]);
    else m3u8Groups.push({ src, entries: [[serverName, eps]] });
  }

  return (
    <div className="glass-dark p-6 rounded-[2.5rem] border border-blue-500/10 space-y-4 relative overflow-hidden shadow-xl">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-2">
        <div className="flex items-center gap-3">
          <Activity className={`w-4 h-4 ${isLoading ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
        </div>
        {/* One dot per source */}
        <div className="flex items-center gap-1 flex-wrap justify-end max-w-[120px]">
          {ALL_KEYS.map(key => (
            <div key={key} title={key} className={`w-1 h-1 rounded-full transition-all duration-500 ${
              doneKeys.has(key)    ? 'bg-green-500 shadow-[0_0_4px_#22c55e]' :
              loadingKeys.has(key) ? 'bg-blue-500 animate-pulse shadow-[0_0_4px_#3b82f6]' : 'bg-white/5'
            }`} />
          ))}
        </div>
      </div>

      {/* Tab bar */}
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

        {isLoading && (
          <div className="flex items-center gap-1.5 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-gray-600">
            <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />
            {loadingKeys.size}…
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="min-h-[56px] animate-cinema-fade" key={activeTab}>

        {/* ── M3U8 streaming servers — grouped by source ── */}
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
            {typeLoading('m3u8') && (
              <div className="flex items-center gap-2 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-gray-600">
                <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />
                {pendingSources('m3u8').join(', ')}…
              </div>
            )}
          </div>
        )}
        {activeTab === 'm3u8' && m3u8Groups.length === 0 && typeLoading('m3u8') && (
          <LoadingHint sources={pendingSources('m3u8')} />
        )}

        {/* ── Downloadable content ── */}
        {activeTab !== 'm3u8' && downloadableByType[activeTab] && (
          <div className="space-y-1">
            {downloadableByType[activeTab].map((l, i) => (
              <DeepRow key={i} link={l}
                actionLabel={activeTab === 'torrent' ? 'Play' : activeTab === 'gdrive' ? 'Drive' : activeTab === 'dailymotion' ? 'Watch' : 'FShare'}
                color={stMeta(activeTab).color}
                onAction={(url, name) => {
                  if (activeTab === 'torrent') {
                    onStreamingReady?.([{ name, url, source_type: 'torrent', source: l.source }], l.source || 'torrent');
                  } else {
                    window.open(url, '_blank');
                  }
                }}
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

        {!activeTab && !isLoading && tabs.length === 0 && (
          <div className="py-4 text-center text-[9px] font-black uppercase tracking-widest text-gray-700">
            No sources available
          </div>
        )}
      </div>
    </div>
  );
};

// ── Loading hint row ──────────────────────────────────────────────────────────
function LoadingHint({ sources }: { sources: string[] }) {
  return (
    <div className="flex items-center gap-2 px-3 py-3 text-[8px] font-black uppercase tracking-widest text-gray-600">
      <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />
      {sources.join(', ')}…
    </div>
  );
}

// ── Cloud target icon resolver ─────────────────────────────────────────────────
function CloudIcon({ icon, cls }: { icon: CloudTarget['icon']; cls?: string }) {
  const c = cls ?? 'w-2.5 h-2.5';
  if (icon === 'server')     return <Server    className={c} />;
  if (icon === 'hard-drive') return <HardDrive className={c} />;
  if (icon === 'box')        return <Box       className={c} />;
  if (icon === 'globe')      return <Globe     className={c} />;
  return <Cloud className={c} />;
}

// ── Cloud action buttons ──────────────────────────────────────────────────────
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

// ── Quick Server Row (m3u8 streaming) ────────────────────────────────────────
function QuickServerRow({ serverName, episodes, color = 'text-orange-400', cloudTargets }: {
  serverName: string; episodes: any[]; color?: string; cloudTargets: CloudTarget[];
}) {
  const [open,     setOpen]     = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const toggleEp  = (i: number) =>
    setSelected(prev => { const s = new Set(prev); s.has(i) ? s.delete(i) : s.add(i); return s; });
  const toggleAll = () =>
    setSelected(prev => prev.size === episodes.length ? new Set() : new Set(episodes.map((_, i) => i)));

  const allSelected = selected.size === episodes.length && episodes.length > 0;
  const selectMode  = selected.size > 0;

  // Show which m3u8 source this server belongs to
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
          <span className="text-[9px] font-bold text-gray-600 shrink-0">({episodes.length} tập)</span>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
            {episodes.map((ep, i) => {
              const isSelected = selected.has(i);
              const epLabel    = ep.name || `Tập ${String(i + 1).padStart(2, '0')}`;
              return (
                <div key={i} className={`flex items-stretch rounded-lg border transition-all ${
                  isSelected ? 'bg-blue-600/20 border-blue-500/40' : 'bg-black/30 border-white/8 hover:border-white/15'
                }`}>
                  <button onClick={() => toggleEp(i)}
                    className="flex-1 flex items-center gap-2 px-2.5 py-2 min-w-0 hover:bg-white/5 rounded-l-lg transition-all">
                    <div className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-all ${
                      isSelected ? 'bg-blue-500 border-blue-400' : 'border-white/20'
                    }`}>
                      {isSelected && <span className="text-[7px] text-white font-black leading-none">✓</span>}
                    </div>
                    <span className="text-[9px] font-bold text-gray-300 truncate">{epLabel}</span>
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
      )}
    </div>
  );
}

// ── Deep Row (downloadable / external link) ───────────────────────────────────
function DeepRow({ link, actionLabel, color, onAction }: { link: MediaLink; actionLabel: string; color: string; onAction?: (url: string, name: string) => void }) {
  const src      = (link as any).source as string | undefined;
  const srcLabel = src ? (SOURCE_BADGE[src] ?? src) : null;

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/5 hover:border-white/10 hover:bg-black/50 transition-all group">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-[9px] font-bold text-gray-300 truncate group-hover:text-white transition-colors" title={link.name}>
          {link.name || 'Unknown'}
        </p>
        <div className="flex items-center gap-1.5">
          {(link as any).size && (
            <span className="text-[7px] font-bold text-gray-600 uppercase tracking-wider">{formatSize((link as any).size)}</span>
          )}
          {srcLabel && (
            <span className="text-[6px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-white/5 text-gray-600">
              {srcLabel}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {(link as any).source_page && (
          <a href={(link as any).source_page} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-all">
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button onClick={() => {
            if (link.url) {
                if (onAction) onAction(link.url, link.name || '');
                else window.open(link.url, '_blank');
            }
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/15 transition-all text-[8px] font-black uppercase tracking-widest ${color}`}>
          <Download className="w-2.5 h-2.5" />
          {actionLabel}
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
