import React, { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { Play, Loader2, ChevronDown } from 'lucide-react';
import { MarqueeText } from '../MarqueeText';
import { useStreamResolvers } from '../../hooks/useStreamResolvers';
import { useMovieDetail } from './MovieDetailContext';

export const TVGallery = () => {
    const {
        metadata, streamingLinks, activeServerIdx, activeEpisodeIdx, setActiveEpisodeIdx,
        activeType, initialSeason, initialEpisode,
        isTorrentStreaming, isFshareResolving, userSettings, slug, activeEmbed,
        seasonBoundaries
    } = useMovieDetail();
    const { handleTorrentStream, handleFshareStream } = useStreamResolvers();

    
    const episodeListRef = useRef<HTMLDivElement>(null);
    const episodeRefs = useRef<(HTMLDivElement | null)[]>([]);
    const seasonHeaderRefs = useRef<(HTMLButtonElement | null)[]>([]);
    const [collapsedSeasons, setCollapsedSeasons] = useState<Set<number>>(new Set());
    const [activeSeason, setActiveSeason] = useState(0);

    const toggleSeason = (idx: number) =>
        setCollapsedSeasons(prev => {
            const next = new Set(prev);
            next.has(idx) ? next.delete(idx) : next.add(idx);
            return next;
        });

    // Jump to season: expand it if collapsed, then scroll its header into view
    const jumpToSeason = useCallback((sIdx: number) => {
        setCollapsedSeasons(prev => {
            if (prev.has(sIdx)) {
                const next = new Set(prev);
                next.delete(sIdx);
                return next;
            }
            return prev;
        });
        setActiveSeason(sIdx);
        
        requestAnimationFrame(() => {
            const container = episodeListRef.current;
            const target = seasonHeaderRefs.current[sIdx];
            if (container && target) {
                // Calculate position relative to container
                const top = target.offsetTop;
                container.scrollTo({ top, behavior: 'smooth' });
            }
        });
    }, []);

    // Scroll-spy: update activeSeason based on which season header is nearest the top
    useEffect(() => {
        const container = episodeListRef.current;
        if (!container) return;
        const onScroll = () => {
            let best = 0;
            let bestDist = Infinity;
            seasonHeaderRefs.current.forEach((el, i) => {
                if (!el) return;
                const dist = Math.abs(el.getBoundingClientRect().top - container.getBoundingClientRect().top);
                if (dist < bestDist) { bestDist = dist; best = i; }
            });
            setActiveSeason(best);
        };
        container.addEventListener('scroll', onScroll, { passive: true });
        return () => container.removeEventListener('scroll', onScroll);
    }, []);

    useEffect(() => {
        if (!seasonBoundaries.length) return;
        if (!initialSeason && !initialEpisode) return;

        const seasonNumber = initialSeason ?? 1;
        const targetSeasonIdx = seasonBoundaries.findIndex(s => s.season_number === seasonNumber);
        if (targetSeasonIdx === -1) return;

        const targetSeason = seasonBoundaries[targetSeasonIdx];
        const localEpisode = Math.max(1, initialEpisode ?? 1);
        const targetGlobalEpisode = Math.min(targetSeason.end - 1, targetSeason.start + localEpisode - 1);

        console.log('[TVGallery] apply initial season/episode', {
            initialSeason,
            initialEpisode,
            targetSeasonIdx,
            targetSeason,
            targetGlobalEpisode,
        });

        setActiveSeason(targetSeasonIdx);
        setActiveEpisodeIdx(targetGlobalEpisode);
    }, [seasonBoundaries, initialSeason, initialEpisode, setActiveEpisodeIdx]);

    useEffect(() => {
        if (!seasonBoundaries.length) return;

        let seasonNumber = seasonBoundaries[0].season_number;
        let episodeNumber = activeEpisodeIdx + 1;
        for (const season of seasonBoundaries) {
            if (activeEpisodeIdx >= season.start && activeEpisodeIdx < season.end) {
                seasonNumber = season.season_number;
                episodeNumber = activeEpisodeIdx - season.start + 1;
                break;
            }
        }

        const [fullPath, queryPart] = (window.location.hash || '').split('?');
        const params = new URLSearchParams(queryPart || '');
        params.set('s', String(seasonNumber));
        params.set('e', String(episodeNumber));
        const nextHash = `${fullPath || window.location.hash || '#'}?${params.toString()}`;
        if (window.location.hash !== nextHash) {
            window.history.replaceState(null, '', nextHash);
        }
    }, [seasonBoundaries, activeEpisodeIdx]);

    // P2P / DIRECT: render items flat, no episode matching needed
    if (activeType === 'P2P' || activeType === 'DIRECT') {
        const serverData = streamingLinks?.[activeServerIdx]?.server_data ?? [];
        return (
            <div className="flex flex-col h-full bg-[#0a0a0c]">
                <div className="flex-1 overflow-y-auto overflow-x-hidden">
                    {serverData.map((ep: any, epIdx: number) => {
                        const isPlaying = activeEpisodeIdx === epIdx;
                        const isLoading = isPlaying && (isTorrentStreaming || isFshareResolving);
                        return (
                            <div key={epIdx} className={`flex items-stretch overflow-hidden transition-all border-b last:border-b-0 border-white/5 ${isPlaying ? 'bg-blue-600/20' : 'hover:bg-white/[0.04] group/ep'}`}>
                                <button
                                    disabled={isLoading}
                                    onClick={() => {
                                        if (ep.isTorrent) {
                                            handleTorrentStream(ep.magnet || ep.url, streamingLinks[activeServerIdx]?.server_name, epIdx, activeServerIdx);
                                        } else {
                                            setActiveEpisodeIdx(epIdx);
                                        }
                                    }}
                                    className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 overflow-hidden"
                                >
                                    <div className={`w-6 h-6 shrink-0 rounded-lg flex items-center justify-center ${isPlaying ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-600'}`}>
                                        {isLoading ? <Loader2 className="w-2 h-2 animate-spin" /> : <Play className={`w-2 h-2 ${isPlaying ? 'fill-current' : ''}`} />}
                                    </div>
                                    <div className="flex flex-col items-start min-w-0 overflow-hidden flex-1">
                                        <MarqueeText text={ep.name || ep.url} className="text-[10px] font-black uppercase text-gray-300" />
                                        <span className="text-[7px] font-bold text-gray-600 uppercase tracking-widest">{ep.stream_type}</span>
                                    </div>
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0a0a0c]">

            {/* Season quick-jump dropdown — only show when there are multiple seasons */}
            {seasonBoundaries.length > 1 && (
                <div className="shrink-0 px-3 py-2 border-b border-white/5">
                    <select
                        value={activeSeason}
                        onChange={e => jumpToSeason(Number(e.target.value))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-gray-300 cursor-pointer focus:outline-none focus:border-blue-500/50 focus:bg-white/8 transition-all appearance-none"
                        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center' }}
                    >
                        {seasonBoundaries.map((s, sIdx) => (
                            <option key={sIdx} value={sIdx} className="bg-[#0c0c0e] text-gray-300">
                                Season {s.season_number}{s.name && !/^(season|mùa|mua)\s*\d+$/i.test(s.name.trim()) ? ` · ${s.name}` : ''}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div ref={episodeListRef} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                {seasonBoundaries.map((s, sIdx) => {
                    const serverData = streamingLinks?.[activeServerIdx]?.server_data ?? [];
                    const eps = Array.from({ length: s.end - s.start }, (_, i) => s.start + i);

                    return (
                        <div key={sIdx} className="flex flex-col">
                            <button
                                ref={el => { seasonHeaderRefs.current[sIdx] = el; }}
                                onClick={() => toggleSeason(sIdx)}
                                className="sticky top-0 z-20 px-5 py-2.5 bg-[#0a0a0c]/90 backdrop-blur-md border-y border-white/5 flex items-center justify-between w-full hover:bg-white/[0.02] transition-colors"
                            >
                                <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500/80 shrink-0">
                                        Mùa {s.season_number}
                                    </span>
                                    {(() => {
                                        const generic = /^(season|mùa|mua)\s*\d+$/i.test(s.name.trim());
                                        return !generic ? (
                                            <>
                                                <span className="text-blue-500/40 shrink-0">·</span>
                                                <div className="min-w-0 flex-1">
                                                    <MarqueeText text={s.name} className="text-[9px] font-bold uppercase tracking-[0.15em] text-blue-500/50" />
                                                </div>
                                            </>
                                        ) : null;
                                    })()}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest">{eps.length} Episodes</span>
                                    <ChevronDown className={`w-3 h-3 text-gray-600 transition-transform duration-200 ${collapsedSeasons.has(sIdx) ? '-rotate-90' : ''}`} />
                                </div>
                            </button>

                            {!collapsedSeasons.has(sIdx) && eps.map((globalIdx) => {
                                const localEpNum = globalIdx - s.start + 1;
                                const ep = serverData.find(e => {
                                    const m = e.name?.match(/\d+/);
                                    // Try to match either local episode number or global index
                                    return m ? parseInt(m[0]) === localEpNum : false;
                                });
                                
                                // Secondary check: if local numbering failed, try matching global episode number
                                const finalEp = ep || serverData.find(e => {
                                    const m = e.name?.match(/\d+/);
                                    return m ? parseInt(m[0]) === (globalIdx + 1) : false;
                                });

                                const isPlaying = activeEpisodeIdx === globalIdx;
                                if (globalIdx === activeEpisodeIdx) {
                                    console.log('[TVGallery] active episode match', {
                                        activeServerIdx,
                                        seasonNumber: s.season_number,
                                        globalIdx,
                                        expectedLocalEp: localEpNum,
                                        matchedEpisode: finalEp,
                                    });
                                }
                                
                                const isFshare = finalEp?.source_type === 'fshare' || finalEp?.url?.includes('fshare.vn');
                                if (isFshare && !userSettings?.fshare_session) return null;

                                const hasLink = !!finalEp;
                                const isLoading = isPlaying && (isTorrentStreaming || isFshareResolving);

                                return (
                                    <div key={globalIdx} ref={el => { episodeRefs.current[globalIdx] = el; }} className={`flex items-stretch transition-all duration-200 border-b last:border-b-0 border-white/5 ${!hasLink ? 'opacity-35 bg-black/20 text-gray-700' : isPlaying ? 'bg-blue-600/20' : 'hover:bg-white/[0.04]'}`}>
                                        <button 
                                            disabled={!hasLink || isLoading}
                                            onClick={() => {
                                                if (!finalEp) return;
                                                if (finalEp.isTorrent) {
                                                    handleTorrentStream(finalEp.magnet, streamingLinks[activeServerIdx]?.server_name, globalIdx, activeServerIdx);
                                                } else if (isFshare) {
                                                    handleFshareStream(finalEp.url, streamingLinks[activeServerIdx]?.server_name, globalIdx, activeServerIdx);
                                                } else {
                                                    setActiveEpisodeIdx(globalIdx);
                                                }
                                            }}
                                            className="flex-1 flex items-center gap-3 px-4 py-3"
                                        >
                                            <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isPlaying ? 'bg-blue-600 text-white' : 'bg-white/5 text-gray-600'}`}>
                                                {isLoading ? <Loader2 className="w-2 h-2 animate-spin" /> : <Play className={`w-2 h-2 ${isPlaying ? 'fill-current' : ''}`} />}
                                            </div>
                                            <div className="flex flex-col items-start">
                                                <span className={`text-[10px] font-black uppercase ${isPlaying ? 'text-white' : 'text-gray-400'}`}>Episode {String(globalIdx + 1).padStart(2, '0')}</span>
                                                <span className="text-[7px] font-bold text-gray-600 uppercase tracking-widest">{finalEp?.stream_type || 'DIGITAL'}</span>
                                            </div>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    );

                })}
            </div>
        </div>
    );
};
