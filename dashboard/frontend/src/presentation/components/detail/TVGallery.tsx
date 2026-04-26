import { useRef, useEffect, useState, useMemo } from 'react';
import { Play, Tv, ChevronDown, Zap, Globe, HardDrive, Layout, ChevronRight, Box, Magnet, Pin } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api, getProxiedImageUrl } from '../../../api/config';
import { useMediaDetail } from '../../context/MediaDetailContext';
import { useCloudViewModel } from '../../view-models/CloudViewModel';
import { CloudButtons } from '../discovery/CloudActions';
import type { CloudTarget } from '../../../services/cloudTargets';

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
        initialSeason, initialEpisode,
        seasonBoundaries, setActiveSeasonIdx, activeType, streamableSources,
        setActiveType, setActiveProvider, activeProvider, playbackState, setActiveEmbed, activeEmbed,
        setActiveServerIdx, userSettings, setUserSettings
    } = useMediaDetail();

    const preferredServer = (userSettings as any)?.preferred_server as string | undefined;

    const savePreferredServer = async (serverName: string) => {
        const newSettings = { ...(userSettings || {}), preferred_server: serverName };
        setUserSettings(newSettings);
        try { await api.post('/user/settings', { preferred_server: serverName }); } catch {}
    };

    const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ 'HLS': true, 'EMBED': false, 'P2P': true, 'DIRECT': true });
    const stripRef = useRef<HTMLDivElement>(null);

    const activeSeasonIdx = seasonBoundaries.findIndex(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
    const activeSeason = seasonBoundaries[activeSeasonIdx];

    useEffect(() => {
        if (!seasonBoundaries.length) return;
        const targetSeasonIdx = Math.max(0, seasonBoundaries.findIndex(s => s.season_number === (initialSeason ?? 1)));
        const targetSeason = seasonBoundaries[targetSeasonIdx];
        const localEpisode = Math.max(1, initialEpisode ?? 1);
        const targetGlobalEpisode = Math.min(targetSeason.end - 1, targetSeason.start + localEpisode - 1);
        
        setActiveSeasonIdx(targetSeasonIdx);
        setActiveEpisodeIdx(targetGlobalEpisode);
        setFocusedIdx(targetGlobalEpisode);
    }, [seasonBoundaries, initialSeason, initialEpisode, setActiveEpisodeIdx, setActiveSeasonIdx]);

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
            Object.entries(providers as any).forEach(([provider, srvList]) => {
                (srvList as any[]).forEach((srv: any, srvIdx: number) => {
                    const ep = srv.server_data?.find((e: any) => {
                        const epNum = extractEpNum(e.name);
                        return epNum !== null && epNum === focusedEpNum;
                    });
                    if (ep) {
                        if (!groups[type]) groups[type] = [];
                        groups[type].push({ type, provider, server: srv, episode: ep, srvIdx });
                    }
                });
            });
        });
        return groups;
    }, [streamableSources, focusedEpNum]);

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
        if (!node.episode?.url && !node.episode?.magnet) return;
        try {
            await api.post('/downloader/add', {
                url: node.episode.url || node.episode.magnet,
                name: node.episode.name || node.server.server_name,
                target: target.id,
                provider: node.provider?.toLowerCase() === 'fshare' ? 'fshare' : 'direct'
            });
            alert(`Gửi lệnh tải tới ${target.label} thành công!`);
        } catch (err) {
            console.error('[TVGallery] Cloud action failed:', err);
            alert('Lỗi khi gửi lệnh tải!');
        }
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
                                    isBoth        ? 'border-blue-500 scale-110 z-20 shadow-[0_30px_60px_rgba(37,99,235,0.5)] ring-[3px] ring-blue-600 ring-offset-[4px] ring-offset-[#0a0a0c]'
                                    : isPlayingOnly ? 'border-blue-600/60 opacity-90 z-10 ring-[3px] ring-blue-600 ring-offset-[4px] ring-offset-[#0a0a0c] shadow-[0_0_30px_rgba(37,99,235,0.3)]'
                                    : isFocusedOnly ? 'border-amber-400/70 scale-110 z-20 shadow-[0_30px_60px_rgba(251,191,36,0.25)]'
                                    : 'border-white/5 opacity-30 hover:opacity-80 hover:border-white/20'
                                }`}
                            >
                                <img src={epThumb} className="w-full h-full object-cover" alt="" loading="lazy" />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-transparent z-10" />
                                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20">
                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-colors ${
                                        isBoth         ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                                        : isPlayingOnly ? 'bg-blue-600/70 border-blue-500/50 text-white'
                                        : isFocusedOnly ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                                        : 'bg-black/60 backdrop-blur-md border-white/10 text-white/90'
                                    }`}>
                                        EP {epNum}
                                    </span>
                                    {isPlaying && (
                                        <div className={`flex items-end gap-[2px] h-3 px-2 py-1 bg-blue-500/90 backdrop-blur-md rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.6)] transition-all duration-300 ${playbackState === 'buffering' ? 'animate-pulse opacity-50' : 'opacity-100'}`}>
                                            <div className="w-[2px] bg-white animate-[wave_0.8s_ease-in-out_infinite]" style={{ animationPlayState: playbackState === 'playing' ? 'running' : 'paused', height: playbackState === 'playing' ? '100%' : '30%' }} />
                                            <div className="w-[2px] bg-white animate-[wave_0.5s_ease-in-out_infinite]" style={{ animationPlayState: playbackState === 'playing' ? 'running' : 'paused', height: playbackState === 'playing' ? '50%' : '20%' }} />
                                            <div className="w-[2px] bg-white animate-[wave_1.1s_ease-in-out_infinite]" style={{ animationPlayState: playbackState === 'playing' ? 'running' : 'paused', height: playbackState === 'playing' ? '75%' : '40%' }} />
                                            <div className="w-[2px] bg-white animate-[wave_0.7s_ease-in-out_infinite]" style={{ animationPlayState: playbackState === 'playing' ? 'running' : 'paused', height: playbackState === 'playing' ? '90%' : '25%' }} />
                                        </div>
                                    )}
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
                                                                    <div className="flex flex-col min-w-0">
                                                                        <div className="flex items-center gap-1.5">
                                                                            <span className={`text-[10px] font-black uppercase tracking-widest truncate ${isSelected ? 'text-blue-400' : 'text-white'}`}>{node.server.server_name}</span>
                                                                            {preferredServer === node.server.server_name && (
                                                                                <span className="shrink-0 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-amber-400 text-[6px] font-black uppercase tracking-widest">
                                                                                    <Pin className="w-2 h-2" /> default
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <span className="text-[7px] font-bold text-gray-600 uppercase tracking-[0.2em]">{node.provider}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    {/* Pin button: mark this server as default */}
                                                                    {isSelected && (
                                                                        <button
                                                                            title={preferredServer === node.server.server_name ? 'Server mặc định' : 'Đặt làm server mặc định'}
                                                                            onClick={() => savePreferredServer(node.server.server_name)}
                                                                            className={`p-2 rounded-xl transition-all border ${
                                                                                preferredServer === node.server.server_name
                                                                                    ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                                                                                    : 'bg-white/5 border-white/10 text-gray-600 hover:text-amber-400 hover:border-amber-500/30'
                                                                            }`}
                                                                        >
                                                                            <Pin className="w-3 h-3" />
                                                                        </button>
                                                                    )}
                                                                    <button onClick={() => {
                                                                        setActiveType(node.type);
                                                                        setActiveProvider(node.provider);
                                                                        setActiveServerIdx(node.srvIdx);
                                                                        setActiveEpisodeIdx(focusedGlobalIdx);
                                                                        savePreferredServer(node.server.server_name);

                                                                        const link = node.type === 'HLS'
                                                                            ? (node.episode.m3u8 || node.episode.url)
                                                                            : (node.episode.embed || node.episode.url || node.episode.m3u8);

                                                                        if (link) {
                                                                            console.log(`[TVGallery] Manual selection: ${node.type} from ${node.provider} (Server ${node.srvIdx}) -> ${link}`);
                                                                            setActiveEmbed(link);
                                                                        }
                                                                    }} className={`p-2.5 rounded-xl transition-all shadow-lg ${
                                                                        isSelected ? 'bg-blue-600 text-white' : 'bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white'
                                                                    }`}>
                                                                        <Play className={`w-3.5 h-3.5 ${isSelected ? 'fill-current' : ''}`} />
                                                                    </button>
                                                                    <CloudButtons targets={cloudTargets} compact={true}
                                                                        onDeviceAction={() => window.open(node.episode.url || node.episode.magnet, '_blank')}
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
