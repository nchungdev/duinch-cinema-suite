import { useRef, useEffect, useState, useMemo } from 'react';
import { Play, Tv, ChevronDown, Zap, Globe, HardDrive, Layout, ChevronRight, Box, Magnet, Pin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, getProxiedImageUrl } from '../../../api/config';
import { useMediaDetail } from '../../context/MediaDetailContext';
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
        media, activeEpisodeIdx, setActiveEpisodeIdx,
        initialSeason, initialEpisode, isInitialized, setIsInitialized,
        seasonBoundaries, setActiveSeasonIdx, activeType, streamableSources, setStreamableSources,
        setActiveType, setActiveProvider, activeProvider, playbackState, setActiveEmbed, activeEmbed,
        setActiveServerIdx, userSettings, setUserSettings
    } = useMediaDetail();

    const preferredType = (userSettings as any)?.preferred_type as string | undefined;
    const preferredProvider = (userSettings as any)?.preferred_provider as string | undefined;
    const preferredAudio = (userSettings as any)?.preferred_audio_type as string | undefined;

    const savePreferredSource = async (type: string, provider: string, audio?: string) => {
        const newSettings = { 
            ...(userSettings || {}), 
            preferred_type: type,
            preferred_provider: provider,
            preferred_audio: audio
        };
        setUserSettings(newSettings);
        try { 
            await api.post('/user/settings', { 
                preferred_type: type,
                preferred_provider: provider,
                preferred_audio: audio
            }); 
            showToast('Đã ghi nhớ ưu tiên nguồn phát cho các tập sau', 'success');
        } catch {}
    };

    const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ 'HLS': true, 'EMBED': false, 'P2P': true, 'DIRECT': true });
    const stripRef = useRef<HTMLDivElement>(null);

    // Download Manager Integration
    const downloader = useDownloader();
    const { showToast } = useToast();

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

    const activeSeasonIdx = seasonBoundaries.findIndex(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
    const activeSeason = seasonBoundaries[activeSeasonIdx];

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
    const focusedEpNum = focusedGlobalIdx - (activeSeason?.start || 0) + 1;
    
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
                        return epNum !== null && epNum === focusedEpNum && isCorrectSeason;
                    });
                    if (ep) {

                        if (!groups[type]) groups[type] = [];
                        groups[type].push({ type, provider, server: srv, episode: ep, srvIdx });
                    }
                });
            });
        });
        return groups;
    }, [streamableSources, focusedEpNum, activeSeasonIdx, seasonBoundaries]);

    // Compute the ONE selected node key — guarantees only 1 highlight at a time.
    // Key format: `${type}:${provider}:${srvIdx}` (unique per server entry).
    // Priority: URL-sig match (active episode only) > preferred server name (first match).
    const selectedNodeKey = useMemo(() => {
        const activeSig = extractSig(activeEmbed || '');
        const isViewingActiveEp = focusedGlobalIdx === activeEpisodeIdx;

        // Pass 1: exact URL match — highest confidence
        if (isViewingActiveEp && activeSig) {
            for (const nodes of Object.values(groupedNodes)) {
                for (const node of nodes) {
                    if (node.provider !== activeProvider || node.type !== activeType) continue;
                    const nodeSig = extractSig(node.episode.m3u8) || extractSig(node.episode.embed);
                    if (nodeSig === activeSig) return `${node.type}:${node.provider}:${node.srvIdx}`;
                }
            }
        }

        // Pass 2: preferred server name — first node that matches
        if (preferredServer) {
            for (const nodes of Object.values(groupedNodes)) {
                for (const node of nodes) {
                    if (node.provider !== activeProvider || node.type !== activeType) continue;
                    if (node.server.server_name === preferredServer) return `${node.type}:${node.provider}:${node.srvIdx}`;
                }
            }
        }

        return null;
    }, [groupedNodes, activeType, activeProvider, preferredServer, activeEmbed, focusedGlobalIdx, activeEpisodeIdx]);

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
            <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 bg-white/[0.01]">
                <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase tracking-[0.4em] text-blue-500 mb-1">Navigation</span>
                    <h3 className="text-sm font-black uppercase tracking-widest text-white">Episode Strip</h3>
                </div>
                <div className="relative">
                    <select 
                        className="appearance-none bg-white/5 border border-white/10 rounded-xl px-5 py-2.5 pr-12 text-[10px] font-black uppercase tracking-widest text-blue-400 outline-none hover:bg-white/10 transition-all cursor-pointer"
                        value={activeSeasonIdx}
                        onChange={(e) => {
                            const idx = parseInt(e.target.value);
                            const s = seasonBoundaries[idx];
                            if (s) {
                                setActiveSeasonIdx(idx);
                                setActiveEpisodeIdx(s.start);
                                setFocusedIdx(s.start);
                                // REMOVED: setStreamableSources({}) - because data is fetched exhaustively once
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

            <div className="relative overflow-hidden">
                <div ref={stripRef} className="flex gap-5 overflow-x-auto no-scrollbar py-8 px-10 scroll-smooth">
                    {seasonEps.map((globalIdx) => {
                        const isPlaying = activeEpisodeIdx === globalIdx;
                        const isFocused = focusedGlobalIdx === globalIdx;
                        const epNum = globalIdx - (activeSeason?.start || 0) + 1;
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
                                
                                {/* Central Wave Bar for playing episode */}
                                {isPlaying && (
                                    <div className="absolute inset-0 flex items-center justify-center z-20">
                                        <div className={`flex items-end gap-[3px] h-6 px-3 py-2 bg-blue-500/80 backdrop-blur-md rounded-xl shadow-[0_0_30px_rgba(59,130,246,0.4)] transition-all duration-500 ${playbackState === 'buffering' ? 'animate-pulse opacity-50' : 'opacity-100'}`}>
                                            <div className="w-[3px] bg-white animate-[wave_0.8s_ease-in-out_infinite]" style={{ animationPlayState: playbackState === 'playing' ? 'running' : 'paused', height: playbackState === 'playing' ? '100%' : '30%' }} />
                                            <div className="w-[3px] bg-white animate-[wave_0.5s_ease-in-out_infinite]" style={{ animationPlayState: playbackState === 'playing' ? 'running' : 'paused', height: playbackState === 'playing' ? '60%' : '20%' }} />
                                            <div className="w-[3px] bg-white animate-[wave_1.1s_ease-in-out_infinite]" style={{ animationPlayState: playbackState === 'playing' ? 'running' : 'paused', height: playbackState === 'playing' ? '80%' : '40%' }} />
                                            <div className="w-[3px] bg-white animate-[wave_0.7s_ease-in-out_infinite]" style={{ animationPlayState: playbackState === 'playing' ? 'running' : 'paused', height: playbackState === 'playing' ? '90%' : '25%' }} />
                                        </div>
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
                                        S{String(activeSeason?.season_number).padStart(2, '0')}E{String(focusedEpNum).padStart(2, '0')}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <h4 className="text-xl font-black text-white uppercase tracking-wide">Episode {focusedEpNum}</h4>
                                    <span className="shrink-0 text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 italic">
                                        S{String(activeSeason?.season_number).padStart(2, '0')}E{String(focusedEpNum).padStart(2, '0')}
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
                                                            <div key={idx} className={`group flex items-center justify-between p-3 rounded-2xl transition-all border ${
                                                                isSelected 
                                                                ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]' 
                                                                : 'bg-white/5 border-white/5 hover:border-blue-500/30'
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
                                                                <div className="flex items-center gap-2">
                                                                    <button onClick={() => {
                                                                        setActiveType(node.type);
                                                                        setActiveProvider(node.provider);
                                                                        setActiveServerIdx(node.srvIdx);
                                                                        setActiveEpisodeIdx(focusedGlobalIdx);

                                                                        const link = node.type === 'HLS'
                                                                            ? (node.episode.m3u8 || node.episode.url)
                                                                            : (node.episode.embed || node.episode.url || node.episode.m3u8);

                                                                        if (link) {
                                                                            setActiveEmbed(link);
                                                                        }
                                                                    }} className={`p-2.5 rounded-xl transition-all shadow-lg ${
                                                                        isSelected ? 'bg-blue-600 text-white' : 'bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white'
                                                                    }`}>
                                                                        <Play className={`w-3.5 h-3.5 ${isSelected ? 'fill-current' : ''}`} />
                                                                    </button>

                                                                    <button
                                                                        title={preferredType === node.type && preferredProvider === node.provider && preferredAudio === node.server.audio_type ? 'Đã ghim nguồn này' : 'Ghim nguồn này cho các tập sau'}
                                                                        onClick={() => savePreferredSource(node.type, node.provider, node.server.audio_type)}
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
