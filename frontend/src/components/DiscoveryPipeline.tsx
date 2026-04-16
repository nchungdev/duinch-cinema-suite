import { useState, useEffect } from 'react';
import { Loader2, HardDrive, Activity, Zap, Magnet, Globe, Download, ExternalLink, ChevronDown, Server, Box, Cloud, Search } from 'lucide-react';
import { api } from '../api/config';
import type { MediaLink } from '../api/config';
import { useCloudTargets } from '../hooks/useCloudTargets';
import type { CloudTarget } from '../services/cloudTargets';

interface DiscoveryPipelineProps {
  tmdbId: number;
  title: string;           // original/English title
  localizeTitle?: string;  // localized (e.g. Vietnamese) title
  year?: string | number;
  mediaType: string;
  season?: number;         // active season for discovery TV
  onStreamingReady?: (links: any[]) => void;
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
const PROVIDER_META: Record<string, { color: string; label: string; icon: React.ReactNode }> = {
  kkphim:      { color: 'text-orange-400',  label: 'KKPhim', icon: <Zap className="w-3 h-3" /> },
  ophim:       { color: 'text-pink-400',    label: 'OPhim',  icon: <Zap className="w-3 h-3" /> },
  thuviencine: { color: 'text-emerald-400', label: 'Cine',   icon: <HardDrive className="w-3 h-3" /> },
  fshare:      { color: 'text-green-400',   label: 'FShare', icon: <Search className="w-3 h-3" /> },
  torrent:     { color: 'text-blue-400',    label: 'Torrent', icon: <Magnet className="w-3 h-3" /> },
  gdrive:      { color: 'text-purple-400',  label: 'Drive',   icon: <Globe className="w-3 h-3" /> },
};
const providerMeta = (p: string) =>
  PROVIDER_META[p.toLowerCase()] ?? { color: 'text-sky-400', label: p.charAt(0).toUpperCase() + p.slice(1), icon: <Box className="w-3 h-3" /> };

export const DiscoveryPipeline = ({ tmdbId, title, localizeTitle, year, mediaType, season, onStreamingReady }: DiscoveryPipelineProps) => {
  const cloudTargets = useCloudTargets();

  // 1. Unified results grouped by provider
  // streamableProviders: { provider: { server: episodes[] } }
  const [streamableResults, setStreamableResults] = useState<Record<string, Record<string, any[]>>>({});
  // downloadableResults: { provider: links[] }
  const [downloadableResults, setDownloadableResults] = useState<Record<string, MediaLink[]>>({});

  // 2. Loading tracking
  const [loadingProviders, setLoadingProviders] = useState<Set<string>>(new Set());
  const [doneProviders, setLoadingDone] = useState<Set<string>>(new Set());
  
  const [activeTab, setActiveTab] = useState<string>('');
  const [streamingNotified, setStreamingNotified] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    const providers = ['kkphim', 'ophim', 'thuviencine', 'torrent', 'fshare', 'gdrive'];
    
    // Reset state
    setStreamableResults({});
    setDownloadableResults({});
    setLoadingProviders(new Set(providers));
    setLoadingDone(new Set());
    setActiveTab('');
    setStreamingNotified(false);

    let firstSettledTab = '';

    const runDiscovery = async () => {
      providers.forEach(async (p) => {
        try {
          const params = new URLSearchParams({
            tmdb_id: String(tmdbId),
            media_type: mediaType,
            title,
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

          // ── Handle results by type ──────────────────────────────────────────
          const streamable = results.filter(r => r.type === 'streamable');
          const downloadable = results.filter(r => r.type === 'downloadable');

          // A. Process Streamable (KKPhim, OPhim)
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

          // B. Process Downloadable (Cine, FShare, Torrent, Drive)
          if (downloadable.length > 0) {
            setDownloadableResults(prev => ({
              ...prev,
              [p]: downloadable
            }));
            if (!firstSettledTab) { firstSettledTab = p; setActiveTab(p); }
          }

          markDone(p);
        } catch (err: any) {
          if (err.name === 'CanceledError' || err.name === 'AbortError') return;
          markDone(p);
        }
      });
    };

    const markDone = (p: string) => {
      setLoadingProviders(prev => { const n = new Set(prev); n.delete(p); return n; });
      setLoadingDone(prev => { const n = new Set(prev); n.add(p); return n; });
    };

    runDiscovery();
    return () => ctrl.abort();
  }, [tmdbId, title, localizeTitle, year, mediaType, season]);

  // ── Build visible tabs — append as results arrive ──────────────────────────
  const tabs: SourceTab[] = [
    // 1. Streamable Tabs (KKPhim, OPhim)
    ...Object.entries(streamableResults).map(([prov, servers]) => {
      const meta = providerMeta(prov);
      return {
        id: prov,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        badge: `${Object.keys(servers).length} sv`,
      } satisfies SourceTab;
    }),
    
    // 2. Downloadable Tabs (Cine, FShare, Torrent, GDrive)
    ...Object.entries(downloadableResults).map(([prov, links]) => {
      const meta = providerMeta(prov);
      return {
        id: prov,
        label: meta.label,
        icon: meta.icon,
        color: meta.color,
        badge: `${links.length}`,
      } satisfies SourceTab;
    }),
  ].sort((a, b) => {
    // Keep a consistent order: KKPhim > OPhim > Cine > Torrent > FShare > Drive
    const order = ['kkphim', 'ophim', 'thuviencine', 'torrent', 'fshare', 'gdrive'];
    return order.indexOf(a.id) - order.indexOf(b.id);
  });

  const isLoading = loadingProviders.size > 0;
  const allDone   = loadingProviders.size === 0;

  return (
    <div className="glass-dark p-6 rounded-[2.5rem] border border-blue-500/10 space-y-4 relative overflow-hidden shadow-xl">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4 px-2">
        <div className="flex items-center gap-3">
          <Activity className={`w-4 h-4 ${isLoading ? 'text-blue-500 animate-pulse' : 'text-blue-500/60'}`} />
          <h3 className="text-xs font-black uppercase italic tracking-wider font-outfit text-gray-300">Discovery Engine</h3>
        </div>
        <div className="flex items-center gap-1">
           {['kkphim', 'ophim', 'thuviencine', 'torrent', 'fshare', 'gdrive'].map(p => (
             <div key={p} title={p} className={`w-1 h-1 rounded-full transition-all duration-500 ${
               doneProviders.has(p) ? 'bg-green-500 shadow-[0_0_4px_#22c55e]' :
               loadingProviders.has(p) ? 'bg-blue-500 animate-pulse shadow-[0_0_4px_#3b82f6]' : 'bg-white/5'
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
              <span className={`px-1.5 py-0.5 rounded-md text-[7px] font-black ${
                isActive ? 'bg-white/15 text-white' : 'bg-white/8 text-gray-500'
              }`}>
                {tab.badge}
              </span>
            </button>
          );
        })}

        {isLoading && (
          <div className="flex items-center gap-1.5 px-3 py-2 text-[8px] font-black uppercase tracking-widest text-gray-600">
            <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />
            Scanning {loadingProviders.size}…
          </div>
        )}
      </div>

      {/* Tab content */}
      <div className="min-h-[56px] animate-cinema-fade" key={activeTab}>

        {/* ── Streamable Content ── */}
        {streamableResults[activeTab] && (
          <div className="space-y-1">
            {Object.entries(streamableResults[activeTab]).map(([serverName, eps]) => (
              <QuickServerRow key={serverName} serverName={serverName} episodes={eps}
                color={providerMeta(activeTab).color} cloudTargets={cloudTargets} />
            ))}
          </div>
        )}

        {/* ── Downloadable Content (Generic) ── */}
        {downloadableResults[activeTab] && (
          <div className="space-y-1">
             {downloadableResults[activeTab].map((l, i) => (
               <DeepRow key={i} link={l} 
                 actionLabel={activeTab === 'torrent' ? 'Magnet' : activeTab === 'gdrive' ? 'Drive' : 'FShare'} 
                 color={providerMeta(activeTab).color} 
               />
             ))}
          </div>
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

// ── Cloud target icon resolver ────────────────────────────────────────────────
function CloudIcon({ icon, cls }: { icon: CloudTarget['icon']; cls?: string }) {
  const c = cls ?? 'w-2.5 h-2.5';
  if (icon === 'server')     return <Server    className={c} />;
  if (icon === 'hard-drive') return <HardDrive className={c} />;
  if (icon === 'box')        return <Box       className={c} />;
  if (icon === 'globe')      return <Globe     className={c} />;
  return <Cloud className={c} />;
}

// ── Reusable cloud action buttons ────────────────────────────────────────────
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

// ── Quick Server Row ─────────────────────────────────────────────────────────
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

  return (
    <div className={`rounded-xl border transition-all overflow-hidden ${
      open ? 'bg-white/5 border-white/10' : 'bg-black/30 border-white/5 hover:border-white/10'
    }`}>
      <div className="flex items-center gap-2 px-3 py-2.5 flex-wrap">
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 min-w-0 flex-1 text-left">
          <Globe className={`w-3 h-3 ${color} shrink-0`} />
          <span className="text-[10px] font-black uppercase tracking-widest text-gray-300 truncate">{serverName}</span>
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

// ── Shared Deep Row ───────────────────────────────────────────────────────────
function DeepRow({ link, actionLabel, color }: { link: MediaLink; actionLabel: string; color: string }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-xl bg-black/30 border border-white/5 hover:border-white/10 hover:bg-black/50 transition-all group">
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="text-[9px] font-bold text-gray-300 truncate group-hover:text-white transition-colors" title={link.name}>
          {link.name || 'Unknown'}
        </p>
        {(link as any).size && (
          <p className="text-[7px] font-bold text-gray-600 uppercase tracking-wider">{formatSize((link as any).size)}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {(link as any).source_page && (
          <a href={(link as any).source_page} target="_blank" rel="noopener noreferrer"
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-all">
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        <button onClick={() => link.url && window.open(link.url, '_blank')}
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
