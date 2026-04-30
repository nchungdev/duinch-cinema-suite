import { useRef, useEffect, useState, useMemo } from 'react';
import { Play, Tv, ChevronDown, Zap, Globe, HardDrive, Layout, ChevronRight, Box, Magnet, Pin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, getProxiedImageUrl } from '../../../api/config';
import { useMediaDetail, PlaybackState } from '../../context/MediaDetailContext';
import { useCloudViewModel } from '../../view-models/CloudViewModel';
import { CloudButtons } from '../discovery/CloudActions';
import type { CloudTarget } from '../../../services/cloudTargets';
import { useDownloader } from '../../hooks/useDownloader';
import { useToast } from '../../context/ToastContext';
import { DownloadModal } from '../discovery/DownloadModal';
import { HlsDownloaderModal } from '../discovery/HlsDownloaderModal';

const TYPE_LABELS: Record<string, string> = {
    'HLS': 'Native HLS Stream',
    'EMBED': 'Third-party Player',
    'P2P': 'Peer-to-Peer (Torrent)',
    'DIRECT': 'Cloud Direct Link'
};

export const TVGallery = () => {
    const cloudTargets = useCloudViewModel();
    const {
        videoRef,
        media, activeEpisodeIdx, setActiveEpisodeIdx,
        initialSeason, initialEpisode, isInitialized, setIsInitialized,
        seasonBoundaries, setActiveSeasonIdx, activeType, streamableSources, setStreamableSources,
        setActiveType, setActiveProvider, activeProvider, playbackState, setActiveEmbed, activeEmbed,
        setActiveServerIdx, userSettings, setUserSettings
    } = useMediaDetail();

    const preferredType = (userSettings as any)?.preferred_type as string | undefined;
    const preferredProvider = (userSettings as any)?.preferred_provider as string | undefined;
    const preferredAudio = (userSettings as any)?.preferred_audio as string | undefined;
    const preferredServer = (userSettings as any)?.preferred_server as string | undefined;

    const savePreferredSource = async (type: string, provider: string, audio?: string, serverName?: string) => {
        const newSettings = { 
            ...(userSettings || {}), 
            preferred_type: type,
            preferred_provider: provider,
            preferred_audio: audio,
            preferred_server: serverName
        };
        setUserSettings(newSettings);
        try { 
            await api.post('/user/settings', { 
                preferred_type: type,
                preferred_provider: provider,
                preferred_audio: audio,
                preferred_server: serverName
            }); 
            showToast('Đã ghi nhớ ưu tiên nguồn phát cho các tập sau', 'success');
        } catch {}
    };

    const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ 'HLS': true, 'EMBED': false, 'P2P': true, 'DIRECT': true });
    const stripRef = useRef<HTMLDivElement>(null);
    // 'left' | 'right' | null — hướng tập đang phát khi bị scroll ra ngoài
    const [activeEpDir, setActiveEpDir] = useState<'left' | 'right' | null>(null);

    // Download Manager Integration
    const downloader = useDownloader();
    const { showToast } = useToast();

    const activeSeasonIdx = seasonBoundaries.findIndex(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
    const activeSeason = seasonBoundaries[activeSeasonIdx];

    const currentSeasonMeta = (media as any)?.seasons?.find((s: any) => s.season_number === activeSeason?.season_number);
    const hasUniqueSeasonPoster = currentSeasonMeta?.poster && currentSeasonMeta.poster !== (media as any)?.poster;

    // Auto-scroll to active episode
    useEffect(() => {
        const activeElement = document.getElementById(`ep-${activeEpisodeIdx}`);
        if (activeElement && stripRef.current) {
            stripRef.current.scrollTo({
                left: activeElement.offsetLeft - stripRef.current.offsetWidth / 2 + activeElement.offsetWidth / 2,
                behavior: 'smooth'
            });
        }
    }, [activeEpisodeIdx, activeSeasonIdx]);

    // Pin indicator: detect khi tập đang phát bị scroll ra ngoài viewport của strip
    useEffect(() => {
        const strip = stripRef.current;
        if (!strip) return;

        const check = () => {
            const activeEl = document.getElementById(`ep-${activeEpisodeIdx}`);
            if (!activeEl) { setActiveEpDir(null); return; }
            const stripRect = strip.getBoundingClientRect();
            const elRect = activeEl.getBoundingClientRect();
            if (elRect.right < stripRect.left + 20) {
                setActiveEpDir('left');
            } else if (elRect.left > stripRect.right - 20) {
                setActiveEpDir('right');
            } else {
                setActiveEpDir(null);
            }
        };

        check();
        strip.addEventListener('scroll', check, { passive: true });
        return () => strip.removeEventListener('scroll', check);
    }, [activeEpisodeIdx, activeSeasonIdx]);

    const handleDownloadRequest = async (url: string, name: string) => {
        console.log('[TVGallery] Automatic download request for:', name, url);
        
        // 1. Check JD Status
        const isJdOnline = await downloader.checkJDStatus();
        
        if (isJdOnline) {
            console.log('[TVGallery] JD Online: Sending to JD...');
            const ok = await downloader.sendToJD(url, name);
            if (ok) {
                showToast(`Đã gửi tới JDownloader: ${name}`, 'success');
                return;
            } else {
                showToast(`Lỗi kết nối JDownloader. Tải bằng trình duyệt...`, 'error');
            }
        } else {
            showToast(`JDownloader (${activeDevice || 'Node'}) đang Offline. Tải bằng trình duyệt...`, 'info');
        }

        // 2. Fallback to browser (automatic for both static files and HLS)
        console.log('[TVGallery] Falling back to direct browser download...');
        showToast(`Đang tải qua trình duyệt: ${name}`, 'success');
        downloader.downloadInBrowser(url, name);
    };

    useEffect(() => {
        if (!seasonBoundaries.length || isInitialized) return;

        const targetSeasonIdx = Math.max(0, seasonBoundaries.findIndex(s => s.season_number === (initialSeason ?? 1)));
        const season = seasonBoundaries[targetSeasonIdx];
        const targetEpIdx = season.start + (Math.max(1, initialEpisode ?? 1) - 1);

        if (activeEpisodeIdx !== targetEpIdx) setActiveEpisodeIdx(targetEpIdx);
        if (activeSeasonIdx !== targetSeasonIdx) setActiveSeasonIdx(targetSeasonIdx);
        setFocusedIdx(targetEpIdx);
        setIsInitialized(true);
    }, [seasonBoundaries, initialSeason, initialEpisode, setActiveEpisodeIdx, setActiveSeasonIdx, isInitialized, setIsInitialized]);

    if (!seasonBoundaries.length) return null;

    const seasonEps = activeSeason 
        ? Array.from({ length: activeSeason.end - activeSeason.start }, (_, i) => activeSeason.start + i)
        : [];
    
    const focusedGlobalIdx = focusedIdx ?? activeEpisodeIdx;
    const focusedEpNum = focusedGlobalIdx + 1; // SỬ DỤNG SỐ TẬP TUYỆT ĐỐI (CONTINUOUS)
    
    // Shared sig extractor (moved out of render loop)
    const extractSig = (url?: string) => {
        if (!url) return null;
        const parts = url.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        const last = parts[parts.length - 1];
        return last === 'index.m3u8' ? parts[parts.length - 2] : last;
    };

    // ĐỒNG BỘ 100%: Chỉ sử dụng dữ liệu từ Discovery Engine đẩy vào context
    const groupedNodes = useMemo(() => {
        const groups: Record<string, any[]> = {};
        const sources = streamableSources || {};

        const extractEpNum = (name: string) => {
            if (!name) return null;
            const digits = name.toString().replace(/\D/g, '');
            return digits ? parseInt(digits) : null;
        };

        Object.entries(sources).forEach(([type, providers]) => {
            Object.entries(providers as any).forEach(([provider, rawList]) => {
                const items = rawList as any[];
                let servers: any[] = [];
                
                // Support both legacy flat servers and new nested collections
                if (items.length > 0 && 'servers' in items[0]) {
                    items.forEach((col: any) => {
                        (col.servers || []).forEach((srv: any) => {
                            servers.push({
                                ...srv,
                                server_data: srv.episodes || srv.server_data || [],
                                season: col.order
                            });
                        });
                    });
                } else {
                    servers = items;
                }

                servers.forEach((srv: any, srvIdx: number) => {
                    const ep = (srv.server_data || []).find((e: any) => {
                        const epNum = extractEpNum(e.name);
                        const targetSeasonNum = seasonBoundaries[activeSeasonIdx]?.season_number;
                        const isCorrectSeason = (!e.season && !srv.season) || 
                                                (Number(e.season) === targetSeasonNum) || 
                                                (Number(srv.season) === targetSeasonNum);
                        
                        // Khớp số tập: Thử cả số tập tuyệt đối (517) và tương đối (1)
                        const localEpNum = activeSeason ? (focusedGlobalIdx - activeSeason.start + 1) : focusedEpNum;
                        return epNum !== null && (epNum === focusedEpNum || epNum === localEpNum) && isCorrectSeason;
                    });
                    if (ep) {

                        if (!groups[type]) groups[type] = [];
                        groups[type].push({ type, provider, server: srv, episode: ep, srvIdx });
                    }
                });
            });
        });
        return groups;
    }, [streamableSources, focusedEpNum, activeSeasonIdx, seasonBoundaries, activeSeason]);

    // Compute the ONE selected node key — guarantees only 1 highlight at a time.
    // Key format: `${type}:${provider}:${srvIdx}` (unique per server entry).
    const selectedNodeKey = useMemo(() => {
        const isViewingActiveEp = focusedGlobalIdx === activeEpisodeIdx;
        if (!isViewingActiveEp) return null;

        // Pass 1: Strict match using active selection state from context
        if (activeType && activeProvider !== undefined) {
            for (const [type, nodes] of Object.entries(groupedNodes)) {
                if (type !== activeType) continue;
                for (const node of nodes) {
                    if (node.provider === activeProvider && node.srvIdx === activeServerIdx) {
                        return `${type}:${node.provider}:${node.srvIdx}`;
                    }
                }
            }
        }

        // Pass 2: Fallback to signature matching if context state is out of sync
        const activeSig = extractSig(activeEmbed || '');
        if (activeSig) {
            for (const nodes of Object.values(groupedNodes)) {
                for (const node of nodes) {
                    const nodeSig = extractSig(node.episode.m3u8) || extractSig(node.episode.embed);
                    if (nodeSig === activeSig) return `${node.type}:${node.provider}:${node.srvIdx}`;
                }
            }
        }

        return null;
    }, [groupedNodes, activeType, activeProvider, activeServerIdx, activeEmbed, focusedGlobalIdx, activeEpisodeIdx]);

    // Auto-expand the group that contains the active/selected node
    useEffect(() => {
        if (!activeType) return;
        setExpandedGroups(prev => prev[activeType] ? prev : { ...prev, [activeType]: true });
    }, [activeType]);

    const handleCloudAction = async (node: any, target: CloudTarget) => {
        const link = node.episode.m3u8 || node.episode.link_m3u8 || node.episode.url || node.episode.magnet;
        const name = node.episode.name || node.server.server_name;
        if (link) handleDownloadRequest(link, name);
    };

    const toggleGroup = (type: string) => {
        setExpandedGroups(prev => ({ ...prev, [type]: !prev[type] }));
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0c] overflow-hidden">
            {/* ── Season Rich Header ────────────────────────────────────── */}
            <div className="relative px-8 pt-8 pb-4 flex flex-col md:flex-row gap-8 items-start border-b border-white/5 bg-white/[0.01]">
                {/* Season Thumbnail - Only show if different from main poster */}
                {hasUniqueSeasonPoster && (
                    <div className="relative shrink-0 group">
                        <div className="absolute -inset-2 bg-blue-600/20 blur-2xl rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
                        <div className="relative w-32 md:w-40 aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl transition-transform duration-500 hover:scale-105">
                            <img 
                                src={getProxiedImageUrl(currentSeasonMeta.poster)} 
                                className="w-full h-full object-cover" 
                                alt={activeSeason?.name} 
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                        </div>
                    </div>
                )}

                {/* Season Info & Selector */}
                <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-1">
                            <div className="flex items-center gap-3">
                                <h3 className="text-2xl font-black uppercase tracking-tighter text-white">
                                    {activeSeason?.name || 'Season Info'}
                                </h3>
                                <span className="px-2 py-0.5 rounded-lg bg-blue-600/10 border border-blue-500/20 text-blue-400 text-[9px] font-black uppercase tracking-widest">
                                    {activeSeason?.end - activeSeason?.start} Episodes
                                </span>
                            </div>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-[0.3em] flex items-center gap-2">
                                <Tv className="w-3 h-3" /> Navigation Control
                            </p>
                        </div>

                        {/* Enhanced Season Selector */}
                        <div className="relative">
                            <select 
                                className="appearance-none bg-white/5 border border-white/10 rounded-xl px-5 py-2.5 pr-12 text-[10px] font-black uppercase tracking-widest text-blue-400 outline-none hover:bg-white/10 hover:border-blue-500/30 transition-all cursor-pointer shadow-lg"
                                value={activeSeasonIdx}
                                onChange={(e) => {
                                    const idx = parseInt(e.target.value);
                                    const s = seasonBoundaries[idx];
                                    if (s) {
                                        setActiveSeasonIdx(idx);
                                        setActiveEpisodeIdx(s.start);
                                        setFocusedIdx(s.start);
                                    }
                                }}
                            >
                                {seasonBoundaries.map((s, i) => (
                                    <option key={i} value={i} className="bg-[#0c0c0e] text-white">{s.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="w-4 h-4 text-blue-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                    </div>

                    {/* Season Description */}
                    {currentSeasonMeta?.overview && (
                        <p className="text-xs text-gray-400 leading-relaxed max-w-3xl line-clamp-3 md:line-clamp-none font-medium italic opacity-80">
                            {currentSeasonMeta.overview}
                        </p>
                    )}
                </div>
            </div>

            <div className="relative overflow-hidden">
                {/* Sticky Playing Now badge — left side */}
                {activeEpDir === 'left' && (
                    <motion.button
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        onClick={() => {
                            const el = document.getElementById(`ep-${activeEpisodeIdx}`);
                            if (el && stripRef.current) {
                                stripRef.current.scrollTo({ left: el.offsetLeft - stripRef.current.offsetWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
                            }
                        }}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-3 pl-3 pr-5 py-2.5 bg-blue-600/95 backdrop-blur-xl text-white rounded-r-[2rem] shadow-[20px_0_40px_rgba(0,0,0,0.4),0_0_20px_rgba(37,99,235,0.4)] border-r border-y border-white/20 transition-all hover:bg-blue-500 active:scale-95 cursor-pointer group"
                    >
                        <div className="relative">
                            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/30 group-hover:border-white transition-colors">
                                <img src={getProxiedImageUrl((media as any)?.poster)} className="w-full h-full object-cover" alt="" />
                            </div>
                            <div className="absolute -right-1 -bottom-1 bg-blue-500 rounded-full p-0.5 border border-white/20">
                                <Play className="w-2 h-2 fill-white" />
                            </div>
                        </div>
                        <div className="flex flex-col items-start leading-tight">
                            <span className="text-[10px] font-black uppercase tracking-tighter">Now Playing</span>
                            <span className="text-[12px] font-black italic">EP {activeEpisodeIdx + 1}</span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-white/60 group-hover:translate-x-1 transition-transform rotate-180" />
                    </motion.button>
                )}

                {/* Sticky Playing Now badge — right side */}
                {activeEpDir === 'right' && (
                    <motion.button
                        initial={{ x: 50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        onClick={() => {
                            const el = document.getElementById(`ep-${activeEpisodeIdx}`);
                            if (el && stripRef.current) {
                                stripRef.current.scrollTo({ left: el.offsetLeft - stripRef.current.offsetWidth / 2 + el.offsetWidth / 2, behavior: 'smooth' });
                            }
                        }}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-3 pr-3 pl-5 py-2.5 bg-blue-600/95 backdrop-blur-xl text-white rounded-l-[2rem] shadow-[-20px_0_40px_rgba(0,0,0,0.4),0_0_20px_rgba(37,99,235,0.4)] border-l border-y border-white/20 transition-all hover:bg-blue-500 active:scale-95 cursor-pointer group text-right"
                    >
                        <ChevronRight className="w-4 h-4 text-white/60 group-hover:-translate-x-1 transition-transform" />
                        <div className="flex flex-col items-end leading-tight">
                            <span className="text-[10px] font-black uppercase tracking-tighter text-blue-200">Now Playing</span>
                            <span className="text-[12px] font-black italic">EP {activeEpisodeIdx + 1}</span>
                        </div>
                        <div className="relative">
                            <div className="w-8 h-8 rounded-full overflow-hidden border-2 border-white/30 group-hover:border-white transition-colors">
                                <img src={getProxiedImageUrl((media as any)?.poster)} className="w-full h-full object-cover" alt="" />
                            </div>
                            <div className="absolute -left-1 -bottom-1 bg-blue-500 rounded-full p-0.5 border border-white/20">
                                <Play className="w-2 h-2 fill-white" />
                            </div>
                        </div>
                    </motion.button>
                )}

                <div ref={stripRef} className="flex gap-5 overflow-x-auto no-scrollbar py-8 px-10 scroll-smooth">
                    {seasonEps.map((globalIdx) => {
                        const isPlaying = activeEpisodeIdx === globalIdx;
                        const isFocused = focusedGlobalIdx === globalIdx;
                        const epNum = globalIdx + 1; // CHUYỂN SANG SỐ TẬP TUYỆT ĐỐI
                        const epThumb = getProxiedImageUrl((media as any)?.poster);

                        // Three distinct visual states
                        const isPlayingOnly  = isPlaying && !isFocused;
                        const isFocusedOnly  = isFocused && !isPlaying;
                        const isBoth         = isPlaying && isFocused;

                        return (
                            <div
                                id={`ep-${globalIdx}`}
                                key={globalIdx}
                                onMouseEnter={() => setFocusedIdx(globalIdx)}
                                onClick={() => setActiveEpisodeIdx(globalIdx)}
                                className={`relative shrink-0 w-52 aspect-video rounded-2xl overflow-hidden cursor-pointer transition-all duration-500 border-2 ${
                                    isBoth        ? 'border-blue-500 scale-110 z-20 shadow-[0_30px_60px_rgba(37,99,235,0.5)]'
                                    : isPlayingOnly ? 'border-blue-600/60 opacity-90 z-10 shadow-[0_0_30px_rgba(37,99,235,0.3)]'
                                    : isFocusedOnly ? 'border-white/40 scale-110 z-20 shadow-[0_30px_60px_rgba(255,255,255,0.1)]'
                                    : 'border-white/5 opacity-30 hover:opacity-80 hover:border-white/20'
                                }`}
                            >
                                <img src={epThumb} className="w-full h-full object-cover" alt="" loading="lazy" />
                                
                                {/* Overlay for playing episode */}
                                {isPlaying && <div className="absolute inset-0 bg-black/60 z-10" />}
                                
                                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-transparent z-10" />
                                
                                {/* Central state indicator — clickable play/pause (HLS only) */}
                                {isPlaying && (
                                    <div
                                        className="absolute inset-0 flex items-center justify-center z-20"
                                        onClick={(e) => {
                                            // embed mode: không can thiệp được, chỉ HLS mới control được
                                            const video = videoRef.current;
                                            if (!video) return;
                                            e.stopPropagation();
                                            if (video.paused) video.play();
                                            else video.pause();
                                        }}
                                    >
                                        {/* buffering — spinner, không clickable */}
                                        {playbackState === PlaybackState.Buffering && (
                                            <div className="w-12 h-12 flex items-center justify-center bg-blue-600/80 backdrop-blur-xl rounded-full shadow-[0_0_30px_rgba(59,130,246,0.5)]">
                                                <svg className="w-6 h-6 text-white animate-spin" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3"/>
                                                    <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                                                </svg>
                                            </div>
                                        )}
                                        {/* playing — sound wave, click để pause */}
                                        {playbackState === PlaybackState.Playing && (
                                            <div className="w-12 h-12 flex items-center justify-center bg-blue-600/80 backdrop-blur-xl rounded-full shadow-[0_0_30px_rgba(59,130,246,0.5)] cursor-pointer hover:bg-blue-500 transition-colors">
                                                <div className="flex items-end gap-[3px] h-4">
                                                    <div className="w-[3px] bg-white rounded-full animate-[wave_0.8s_ease-in-out_infinite]" style={{ height: '100%' }} />
                                                    <div className="w-[3px] bg-white rounded-full animate-[wave_0.5s_ease-in-out_infinite]" style={{ height: '60%' }} />
                                                    <div className="w-[3px] bg-white rounded-full animate-[wave_1.1s_ease-in-out_infinite]" style={{ height: '80%' }} />
                                                </div>
                                            </div>
                                        )}
                                        {/* paused — 2 bar, click để resume */}
                                        {playbackState === PlaybackState.Paused && (
                                            <div className="w-12 h-12 flex items-center justify-center bg-white/20 backdrop-blur-xl rounded-full shadow-[0_0_20px_rgba(255,255,255,0.15)] border border-white/20 cursor-pointer hover:bg-white/30 transition-colors">
                                                <div className="flex items-center gap-[4px]">
                                                    <div className="w-[4px] h-[14px] bg-white rounded-full" />
                                                    <div className="w-[4px] h-[14px] bg-white rounded-full" />
                                                </div>
                                            </div>
                                        )}
                                        {/* stopped — play icon mờ */}
                                        {playbackState === PlaybackState.Stopped && (
                                            <div className="w-12 h-12 flex items-center justify-center bg-black/40 backdrop-blur-xl rounded-full border border-white/10 cursor-pointer hover:bg-black/60 transition-colors">
                                                <Play className="w-5 h-5 text-white/60 fill-white/60 ml-0.5" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20">
                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-colors ${
                                        isBoth         ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                                        : isPlayingOnly ? 'bg-blue-600/70 border-blue-500/50 text-white'
                                        : isFocusedOnly ? 'bg-white/10 border-white/20 text-white'
                                        : 'bg-black/60 backdrop-blur-md border-white/10 text-white/90'
                                    }`}>
                                        EP {epNum}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="flex-1 min-h-[350px] bg-white/[0.02] border-t border-white/5 p-8 overflow-y-auto no-scrollbar">
                <AnimatePresence mode="popLayout" initial={false}>
                    <motion.div key={focusedGlobalIdx} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
                        <div className="flex items-center justify-between gap-3">
                            {focusedGlobalIdx !== activeEpisodeIdx ? (
                                <>
                                    <h4 className="text-xl font-black text-amber-300 uppercase tracking-wide">
                                        Preview — Ep {focusedEpNum}
                                    </h4>
                                    <span className="shrink-0 text-[10px] font-black text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30 italic">
                                        Season {activeSeason?.season_number} — EP {focusedEpNum}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <h4 className="text-xl font-black text-white uppercase tracking-wide">Episode {focusedEpNum}</h4>
                                    <span className="shrink-0 text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 italic">
                                        Season {activeSeason?.season_number} — EP {focusedEpNum}
                                    </span>
                                </>
                            )}
                        </div>

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-600">Available Transmission Nodes</span>
                            </div>
                            <div className="space-y-3">
                                {Object.keys(groupedNodes).length === 0 ? (
                                    <div className="py-4 text-center opacity-20 text-[9px] font-black uppercase italic tracking-widest">Waiting for Discovery Engine data...</div>
                                ) : (
                                    Object.entries(groupedNodes).map(([type, nodes]) => (
                                        <div key={type} className="space-y-2">
                                            <button onClick={() => toggleGroup(type)} className="w-full flex items-center justify-between px-2 py-1 hover:bg-white/5 rounded-lg transition-colors">
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${expandedGroups[type] ? 'bg-blue-500' : 'bg-gray-700'}`} />
                                                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">{TYPE_LABELS[type] || type}</span>
                                                </div>
                                                <ChevronRight className={`w-3 h-3 text-gray-700 transition-transform ${expandedGroups[type] ? 'rotate-90' : ''}`} />
                                            </button>
                                            {expandedGroups[type] && (
                                                <div className="grid grid-cols-1 gap-2 pl-4">
                                                    {nodes.map((node, idx) => {
                                                        const nodeKey = `${node.type}:${node.provider}:${node.srvIdx}`;
                                                        const isSelected = nodeKey === selectedNodeKey;

                                                        return (
                                                            <div key={idx} onClick={() => {
                                                                    setActiveType(node.type);
                                                                    setActiveProvider(node.provider);
                                                                    setActiveServerIdx(node.srvIdx);
                                                                    setActiveEpisodeIdx(focusedGlobalIdx);
                                                                    const link = node.type === 'HLS'
                                                                        ? (node.episode.m3u8 || node.episode.url)
                                                                        : (node.episode.embed || node.episode.url || node.episode.m3u8);
                                                                    if (link) setActiveEmbed(link);
                                                                }} className={`group flex items-center justify-between p-3 rounded-2xl transition-all border cursor-pointer ${
                                                                isSelected 
                                                                ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]' 
                                                                : 'bg-white/5 border-white/5 hover:border-blue-500/30 hover:bg-white/[0.07]'
                                                            }`}>
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${
                                                                        isSelected ? 'bg-blue-600 text-white' : 'bg-black/40 text-blue-500 group-hover:text-white'
                                                                    }`}>
                                                                        {node.type === 'HLS' ? <Zap className="w-3.5 h-3.5" /> : 
                                                                         node.type === 'P2P' ? <Magnet className="w-3.5 h-3.5" /> :
                                                                         node.type === 'DIRECT' ? <Box className="w-3.5 h-3.5" /> : <Layout className="w-3.5 h-3.5" />}
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0 flex-1">
                                                                        <div className="flex items-center gap-2">
                                                                            <span className={`text-[11px] font-black uppercase tracking-wider truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>{node.server.server_name}</span>
                                                                            {node.server.audio_type && (
                                                                                <span className="shrink-0 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400 text-[7px] font-black uppercase tracking-widest">
                                                                                    {'{'}{node.server.audio_type}{'}'}
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                    <button
                                                                        title={preferredType === node.type && preferredProvider === node.provider && preferredAudio === node.server.audio_type ? 'Đã ghim nguồn này' : 'Ghim nguồn này cho các tập sau'}
                                                                        onClick={() => savePreferredSource(node.type, node.provider, node.server.audio_type, node.server.server_name)}
                                                                        className={`p-2.5 rounded-xl transition-all border ${
                                                                            preferredType === node.type && preferredProvider === node.provider && preferredAudio === node.server.audio_type
                                                                                ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
                                                                                : 'bg-white/5 border-white/10 text-gray-500 hover:text-amber-400 hover:border-amber-500/30'
                                                                        }`}
                                                                    >
                                                                        <Pin className={`w-3.5 h-3.5 ${preferredType === node.type && preferredProvider === node.provider && preferredAudio === node.server.audio_type ? 'fill-current' : ''}`} />
                                                                    </button>

                                                                    <CloudButtons targets={cloudTargets} compact={true}
                                                                        onDeviceAction={() => {
                                                                            const link = node.episode.m3u8 || node.episode.link_m3u8 || node.episode.url || node.episode.magnet;
                                                                            const name = node.episode.name || node.server.server_name;
                                                                            if (link) handleDownloadRequest(link, name);
                                                                        }}
                                                                        onCloudAction={(target) => handleCloudAction(node, target)} />
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
};
