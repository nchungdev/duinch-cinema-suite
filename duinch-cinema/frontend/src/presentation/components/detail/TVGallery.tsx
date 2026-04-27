import { useRef, useEffect, useState, useMemo } from 'react';
import { Play, Loader2, Download, Tv, ChevronRight, ChevronLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import useSWR from 'swr';
import { api } from '../../../api/config';
import { useMediaDetail } from '../../context/MediaDetailContext';

const fetcher = (url: string) => api.get(url).then(res => res.data.data);

export const TVGallery = () => {
    const {
        media, streamingLinks, activeServerIdx, activeEpisodeIdx, setActiveEpisodeIdx,
        initialSeason, initialEpisode,
        seasonBoundaries, activeSeasonIdx, setActiveSeasonIdx, activeType
    } = useMediaDetail();

    const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const tabsRef = useRef<HTMLDivElement>(null);

    // Fetch TMDB metadata for the currently active season
    const currentSeason = seasonBoundaries[activeSeasonIdx];
    const { data: tmdbSeason, isLoading: loadingSeason } = useSWR(
        media && currentSeason ? `/detail/tv/${media.id}/season/${currentSeason.season_number}` : null,
        fetcher
    );

    // Sync focused index with active episode when season changes
    useEffect(() => {
        if (currentSeason) {
            setFocusedIdx(activeEpisodeIdx);
        }
    }, [activeSeasonIdx, activeEpisodeIdx, currentSeason]);

    // Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!currentSeason || focusedIdx === null) return;
            
            if (e.key === 'ArrowRight') {
                e.preventDefault();
                setFocusedIdx(Math.min(currentSeason.end - 1, focusedIdx + 1));
            } else if (e.key === 'ArrowLeft') {
                e.preventDefault();
                setFocusedIdx(Math.max(currentSeason.start, focusedIdx - 1));
            } else if (e.key === 'Enter') {
                e.preventDefault();
                setActiveEpisodeIdx(focusedIdx);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [focusedIdx, currentSeason, setActiveEpisodeIdx]);

    if (!seasonBoundaries.length) {
        return (
            <div className="flex flex-col items-center justify-center py-10 opacity-40">
                <Loader2 className="w-6 h-6 animate-spin mb-2" />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-500">Mapping Transmission...</span>
            </div>
        );
    }

    const seasonEps = currentSeason ? Array.from({ length: currentSeason.end - currentSeason.start }, (_, i) => currentSeason.start + i) : [];
    const focusedEpData = tmdbSeason?.episodes?.[(focusedIdx ?? 0) - (currentSeason?.start ?? 0)];

    return (
        <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Season Tabs */}
            <div className="relative group">
                <div ref={tabsRef} className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 px-1">
                    {seasonBoundaries.map((s, idx) => (
                        <button
                            key={idx}
                            onClick={() => setActiveSeasonIdx(idx)}
                            className={`shrink-0 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-[0.2em] transition-all border ${
                                activeSeasonIdx === idx 
                                    ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20 scale-105' 
                                    : 'bg-white/5 border-white/5 text-gray-500 hover:bg-white/10 hover:text-gray-300'
                            }`}
                        >
                            {s.name}
                        </button>
                    ))}
                </div>
                <div className="absolute right-0 top-0 bottom-2 w-12 bg-gradient-to-l from-[#0a0a0c] to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>

            {/* Episode Strip */}
            <div className="relative">
                <div ref={scrollRef} className="flex gap-4 overflow-x-auto no-scrollbar py-4 px-1 min-h-[140px]">
                    {seasonEps.map((globalIdx) => {
                        const isPlaying = activeEpisodeIdx === globalIdx;
                        const isFocused = focusedIdx === globalIdx;
                        const epNum = globalIdx - (currentSeason?.start ?? 0) + 1;
                        const tmdbEp = tmdbSeason?.episodes?.[epNum - 1];

                        return (
                            <div
                                key={globalIdx}
                                onMouseEnter={() => setFocusedIdx(globalIdx)}
                                onClick={() => setActiveEpisodeIdx(globalIdx)}
                                className={`relative shrink-0 w-44 aspect-video rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 border-2 ${
                                    isFocused ? 'border-blue-500 scale-105 z-10 shadow-2xl shadow-blue-500/20' : 'border-white/5 opacity-60 hover:opacity-100'
                                } ${isPlaying ? 'ring-2 ring-blue-500 ring-offset-4 ring-offset-[#0a0a0c]' : ''}`}
                            >
                                {tmdbEp?.still_path ? (
                                    <img src={tmdbEp.still_path} className="w-full h-full object-cover" alt="" />
                                ) : (
                                    <div className="w-full h-full bg-white/5 flex items-center justify-center">
                                        <Tv className="w-6 h-6 text-gray-700" />
                                    </div>
                                )}
                                
                                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                <div className="absolute bottom-3 left-3 flex items-center gap-2">
                                    <span className="text-[10px] font-black text-white/90 bg-black/40 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/10">
                                        EP {String(epNum).padStart(2, '0')}
                                    </span>
                                    {isPlaying && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-500 rounded-lg shadow-lg">
                                            <Play className="w-2 h-2 fill-current text-white" />
                                            <span className="text-[7px] font-black text-white uppercase">Playing</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Episode Details Overlay / Panel */}
            <AnimatePresence mode="wait">
                <motion.div
                    key={focusedIdx}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="relative bg-white/[0.03] backdrop-blur-3xl rounded-[2.5rem] border border-white/5 overflow-hidden"
                >
                    <div className="p-8">
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-4 mb-3">
                                <h4 className="text-xl font-black text-white tracking-wide uppercase truncate">
                                    {focusedEpData?.name || `Tập ${String((focusedIdx ?? 0) - (currentSeason?.start ?? 0) + 1).padStart(2, '0')}`}
                                </h4>
                                <div className="flex items-center gap-3">
                                    <span className="text-[10px] font-black text-blue-400 bg-blue-500/10 px-3 py-1 rounded-full border border-blue-500/20 tracking-widest">
                                        S{String(currentSeason?.season_number).padStart(2, '0')} E{String((focusedIdx ?? 0) - (currentSeason?.start ?? 0) + 1).padStart(2, '0')}
                                    </span>
                                </div>
                            </div>
                            
                            <p className="text-sm text-gray-400 leading-relaxed line-clamp-3 mb-6 font-medium">
                                {focusedEpData?.overview || "Không có mô tả cho tập phim này."}
                            </p>

                            {/* Server List */}
                            <div className="flex items-center gap-3 flex-wrap">
                                {(() => {
                                    const servers: any[] = [];
                                    Object.entries(streamableSources).forEach(([type, providers]) => {
                                        Object.entries(providers).forEach(([provider, sList]) => {
                                            sList.forEach(srv => {
                                                servers.push({ type, provider, server: srv });
                                            });
                                        });
                                    });

                                    return servers.map((item, sIdx) => {
                                        const { type, provider, server: srv } = item;
                                        // Check if this server has the focused episode
                                        const epNum = (focusedIdx ?? 0) - (currentSeason?.start ?? 0) + 1;
                                        const extractNum = (name: string) => { 
                                            const m = name?.match(/\d+/); 
                                            return m ? parseInt(m[0]) : null; 
                                        };
                                        const ep = srv.server_data.find((e: any) => {
                                            const n = extractNum(e.name);
                                            return n === epNum || n === (focusedIdx ?? 0) + 1;
                                        });

                                        if (!ep) return null;

                                        return (
                                            <div 
                                                key={`${type}-${provider}-${sIdx}`}
                                                className="flex items-center gap-3 bg-white/5 hover:bg-white/8 border border-white/10 rounded-2xl px-4 py-2 transition-all hover:scale-105 group/srv"
                                            >
                                                <div className="flex flex-col">
                                                    <span className="text-[8px] font-black uppercase tracking-widest text-blue-500/60 group-hover/srv:text-blue-400">
                                                        {provider} • {type}
                                                    </span>
                                                    <span className="text-[10px] font-bold text-gray-300 uppercase truncate max-w-[100px]">
                                                        {srv.server_name}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 ml-2">
                                                    <button 
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setActiveType(item.type);
                                                            setActiveProvider(item.provider);
                                                            setActiveEpisodeIdx(focusedIdx!); 
                                                        }}
                                                        className="p-2 rounded-xl bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white transition-all"
                                                        title="Phát tập này"
                                                    >
                                                        <Play className="w-3.5 h-3.5 fill-current" />
                                                    </button>
                                                    <button 
                                                        className="p-2 rounded-xl bg-white/5 hover:bg-white/20 text-gray-500 hover:text-white transition-all"
                                                        title="Tải xuống"
                                                    >
                                                        <Download className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>
                        </div>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};
