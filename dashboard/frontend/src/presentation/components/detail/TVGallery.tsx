import { useRef, useEffect, useState, useMemo } from 'react';
import { Play, Loader2, Download, Tv, ChevronDown, Activity, Zap, Globe, HardDrive, Layout, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { api, getProxiedImageUrl } from '../../../api/config';
import { useMediaDetail } from '../../context/MediaDetailContext';
import { MarqueeText } from '../MarqueeText';

const fetcher = (url: string) => api.get(url).then(res => res.data);

const PROVIDER_ICONS: Record<string, any> = {
    'KKPHIM': <Zap className="w-3 h-3" />,
    'OPHIM': <Zap className="w-3 h-3" />,
    'FSHARE': <HardDrive className="w-3 h-3" />,
    'TORRENT': <Activity className="w-3 h-3" />,
    'GDRIVE': <Globe className="w-3 h-3" />,
};

const TYPE_LABELS: Record<string, string> = {
    'HLS': 'Native HLS Stream',
    'EMBED': 'Third-party Player',
    'P2P': 'Peer-to-Peer (Torrent)',
    'DIRECT': 'Cloud Direct Link'
};

export const TVGallery = () => {
    const {
        media, streamingLinks, activeServerIdx, activeEpisodeIdx, setActiveEpisodeIdx,
        initialSeason, initialEpisode,
        seasonBoundaries, setActiveSeasonIdx, activeType, streamableSources,
        setActiveType, setActiveProvider
    } = useMediaDetail();

    const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({ 'HLS': true, 'EMBED': false, 'P2P': true, 'DIRECT': true });
    const stripRef = useRef<HTMLDivElement>(null);

    const activeSeasonIdx = seasonBoundaries.findIndex(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
    const activeSeason = seasonBoundaries[activeSeasonIdx];

    const { data: tmdbSeason, isLoading: loadingSeason } = useSWR(
        media && activeSeason ? `/tv/${media.id}/season/${activeSeason.season_number}` : null,
        fetcher
    );

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

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!activeSeason || focusedIdx === null) return;
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                const next = Math.min(activeSeason.end - 1, focusedIdx + 1);
                setFocusedIdx(next);
                document.getElementById(`ep-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                const prev = Math.max(activeSeason.start, focusedIdx - 1);
                setFocusedIdx(prev);
                document.getElementById(`ep-${prev}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                setActiveEpisodeIdx(focusedIdx);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedIdx, activeSeason, setActiveEpisodeIdx]);

    if (!seasonBoundaries.length) return null;

    const seasonEps = activeSeason 
        ? Array.from({ length: activeSeason.end - activeSeason.start }, (_, i) => activeSeason.start + i)
        : [];
    
    const focusedGlobalIdx = focusedIdx ?? activeEpisodeIdx;
    const focusedEpNum = focusedGlobalIdx - (activeSeason?.start || 0) + 1;
    const focusedEpData = tmdbSeason?.data?.episodes?.find((e: any) => e.episode_number === focusedEpNum) || 
                         tmdbSeason?.episodes?.find((e: any) => e.episode_number === focusedEpNum);

    const groupedNodes = useMemo(() => {
        const groups: Record<string, any[]> = {};
        Object.entries(streamableSources).forEach(([type, providers]) => {
            Object.entries(providers).forEach(([provider, srvList]) => {
                srvList.forEach((srv: any) => {
                    const ep = srv.server_data.find((e: any) => {
                        const n = e.name?.match(/\d+/);
                        return n && parseInt(n[0]) === focusedEpNum;
                    });
                    if (ep) {
                        if (!groups[type]) groups[type] = [];
                        groups[type].push({ type, provider, server: srv, episode: ep });
                    }
                });
            });
        });
        return groups;
    }, [streamableSources, focusedEpNum]);

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
                            <option key={i} value={i} className="bg-[#0c0c0e]">{s.name}</option>
                        ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-blue-500 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
            </div>

            <div className="relative overflow-hidden">
                <div 
                    ref={stripRef}
                    className="flex gap-5 overflow-x-auto no-scrollbar py-8 px-10 scroll-smooth"
                >
                    {seasonEps.map((globalIdx) => {
                        const isPlaying = activeEpisodeIdx === globalIdx;
                        const isFocused = focusedGlobalIdx === globalIdx;
                        const epNum = globalIdx - (activeSeason?.start || 0) + 1;
                        
                        const tmdbEp = tmdbSeason?.data?.episodes?.find((e: any) => e.episode_number === epNum) || 
                                      tmdbSeason?.episodes?.find((e: any) => e.episode_number === epNum);
                        
                        const rawThumb = tmdbEp?.still_path || (media as any)?.thumb_url || media?.poster;
                        const epThumb = getProxiedImageUrl(rawThumb);

                        return (
                            <div
                                id={`ep-${globalIdx}`}
                                key={globalIdx}
                                onMouseEnter={() => setFocusedIdx(globalIdx)}
                                onClick={() => setActiveEpisodeIdx(globalIdx)}
                                className={`relative shrink-0 w-52 aspect-video rounded-2xl overflow-hidden cursor-pointer transition-all duration-500 border-2 ${
                                    isFocused 
                                    ? 'border-blue-500 scale-110 z-20 shadow-[0_30px_60px_rgba(37,99,235,0.4)]' 
                                    : 'border-white/5 opacity-30 hover:opacity-100 hover:border-white/20'
                                } ${isPlaying ? 'ring-[4px] ring-blue-600 ring-offset-[6px] ring-offset-[#0a0a0c]' : ''}`}
                            >
                                {epThumb ? (
                                    <div className="w-full h-full relative">
                                        <img src={epThumb} className="w-full h-full object-cover" alt="" loading="lazy" />
                                        {!tmdbEp?.still_path && (
                                            <div className="absolute inset-0 bg-blue-900/20 backdrop-brightness-75" />
                                        )}
                                    </div>
                                ) : (
                                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                        <Tv className="w-8 h-8 text-gray-800" />
                                    </div>
                                )}
                                
                                <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-transparent to-transparent z-10" />
                                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between z-20">
                                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-colors ${
                                        isFocused ? 'bg-blue-600 border-blue-400 text-white shadow-lg' : 'bg-black/60 backdrop-blur-md border-white/10 text-white/90'
                                    }`}>
                                        EP {epNum}
                                    </span>
                                    {isPlaying && (
                                        <div className="flex items-end gap-[2px] h-3 px-2 py-1 bg-blue-500/90 backdrop-blur-md rounded-lg shadow-[0_0_20px_rgba(59,130,246,0.6)]">
                                            <div className="w-[2px] bg-white animate-[wave_0.8s_ease-in-out_infinite] h-full" />
                                            <div className="w-[2px] bg-white animate-[wave_0.5s_ease-in-out_infinite] h-1/2" />
                                            <div className="w-[2px] bg-white animate-[wave_1.1s_ease-in-out_infinite] h-3/4" />
                                            <div className="w-[2px] bg-white animate-[wave_0.7s_ease-in-out_infinite] h-[90%]" />
                                        </div>
                                    )}
                                </div>
                                {isFocused && (
                                    <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/20 via-transparent to-white/5 pointer-events-none" />
                                )}
                            </div>
                        );
                    })}
                </div>
                <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[#0a0a0c] via-[#0a0a0c]/20 to-transparent pointer-events-none z-30" />
                <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[#0a0a0c] via-[#0a0a0c]/20 to-transparent pointer-events-none z-30" />
            </div>

            <div className="flex-1 min-h-0 bg-white/[0.02] border-t border-white/5 p-6 overflow-y-auto no-scrollbar">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={focusedGlobalIdx}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="space-y-8"
                    >
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <h4 className="text-lg font-black text-white uppercase tracking-wide truncate pr-4">
                                    {focusedEpData?.name || `Episode ${focusedEpNum}`}
                                </h4>
                                <span className="shrink-0 text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 tracking-tighter italic">
                                    S{String(activeSeason?.season_number).padStart(2, '0')}E{String(focusedEpNum).padStart(2, '0')}
                                </span>
                            </div>
                            <p className="text-[11px] text-gray-500 font-medium leading-relaxed line-clamp-2 italic">
                                {focusedEpData?.overview || "No transmission log for this sector."}
                            </p>
                        </div>

                        {/* Grouped Transmission Nodes */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-600 block">Available Transmission Nodes</span>
                                <span className="text-[7px] font-black text-blue-500/40 uppercase tracking-widest italic">Total Groups: {Object.keys(groupedNodes).length}</span>
                            </div>
                            
                            <div className="space-y-3">
                                {Object.keys(groupedNodes).length === 0 ? (
                                    <div className="py-4 text-center opacity-20 text-[9px] font-black uppercase italic tracking-widest">No nodes found in this sector</div>
                                ) : (
                                    Object.entries(groupedNodes).map(([type, nodes]) => (
                                        <div key={type} className="space-y-2">
                                            {/* Group Header */}
                                            <button 
                                                onClick={() => toggleGroup(type)}
                                                className="w-full flex items-center justify-between px-2 py-1 hover:bg-white/5 rounded-lg transition-colors group/header"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-1.5 h-1.5 rounded-full ${expandedGroups[type] ? 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-gray-700'}`} />
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${expandedGroups[type] ? 'text-blue-400' : 'text-gray-500'}`}>
                                                        {TYPE_LABELS[type] || type}
                                                    </span>
                                                    <span className="text-[8px] px-1.5 py-0.5 bg-white/5 rounded-md text-gray-600 font-black">{nodes.length}</span>
                                                </div>
                                                <ChevronRight className={`w-3 h-3 text-gray-700 transition-transform duration-300 ${expandedGroups[type] ? 'rotate-90 text-blue-500' : ''}`} />
                                            </button>

                                            {/* Group Content */}
                                            <AnimatePresence>
                                                {expandedGroups[type] && (
                                                    <motion.div 
                                                        initial={{ height: 0, opacity: 0 }}
                                                        animate={{ height: 'auto', opacity: 1 }}
                                                        exit={{ height: 0, opacity: 0 }}
                                                        className="grid grid-cols-1 gap-2 overflow-hidden pl-4"
                                                    >
                                                        {nodes.map((node, idx) => (
                                                            <div 
                                                                key={idx}
                                                                className="group flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/[0.08] hover:border-blue-500/30 transition-all"
                                                            >
                                                                <div className="flex items-center gap-3 min-w-0">
                                                                    <div className="w-8 h-8 rounded-xl bg-black/40 flex items-center justify-center text-blue-500 group-hover:text-white transition-colors">
                                                                        {PROVIDER_ICONS[node.provider] || <HardDrive className="w-3.5 h-3.5" />}
                                                                    </div>
                                                                    <div className="flex flex-col min-w-0">
                                                                        <span className="text-[10px] font-black text-white uppercase tracking-widest truncate">
                                                                            {node.server.server_name}
                                                                        </span>
                                                                        <span className="text-[7px] font-bold text-gray-600 uppercase tracking-[0.2em]">
                                                                            {node.provider} • Node ID: {node.episode.id || 'N/A'}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="flex items-center gap-2">
                                                                    <button 
                                                                        onClick={() => {
                                                                            setActiveType(node.type);
                                                                            setActiveProvider(node.provider);
                                                                            setActiveEpisodeIdx(focusedGlobalIdx);
                                                                        }}
                                                                        className="p-2.5 rounded-xl bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white transition-all shadow-lg"
                                                                    >
                                                                        <Play className="w-3.5 h-3.5 fill-current" />
                                                                    </button>
                                                                    <button className="p-2.5 rounded-xl bg-white/5 hover:bg-white/20 text-gray-500 hover:text-white transition-all">
                                                                        <Download className="w-3.5 h-3.5" />
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
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
