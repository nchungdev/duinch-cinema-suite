import { useRef, useEffect } from 'react';
import { Play, Loader2, ChevronDown } from 'lucide-react';
import { MarqueeText } from '../MarqueeText';
import { useMediaDetail } from '../../context/MediaDetailContext';

export const TVGallery = () => {
    const {
        streamingLinks, activeServerIdx, activeEpisodeIdx, setActiveEpisodeIdx,
        initialSeason, initialEpisode,
        seasonBoundaries, setActiveSeasonIdx, activeType
    } = useMediaDetail();

    const episodeListRef = useRef<HTMLDivElement>(null);

    // Sync current season/episode on mount (Discrete non-cascading logic)
    useEffect(() => {
        if (!seasonBoundaries.length) return;

        const targetSeasonIdx = Math.max(0, seasonBoundaries.findIndex(s => s.season_number === (initialSeason ?? 1)));
        const targetSeason = seasonBoundaries[targetSeasonIdx];
        const localEpisode = Math.max(1, initialEpisode ?? 1);
        const targetGlobalEpisode = Math.min(targetSeason.end - 1, targetSeason.start + localEpisode - 1);

        setActiveSeasonIdx(targetSeasonIdx);
        setActiveEpisodeIdx(targetGlobalEpisode);
    }, [seasonBoundaries, initialSeason, initialEpisode, setActiveEpisodeIdx, setActiveSeasonIdx]);

    useEffect(() => {
        if (!seasonBoundaries.length) return;
        const currentSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
        if (currentSeason) {
            const idx = seasonBoundaries.indexOf(currentSeason);
            setActiveSeasonIdx(idx);
        }
    }, [activeEpisodeIdx, seasonBoundaries, setActiveSeasonIdx]);

    if (!seasonBoundaries.length) {
        return (
            <div className="flex flex-col items-center justify-center py-20 opacity-40">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <span className="text-[10px] font-black uppercase tracking-widest">Scanning Grid...</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-[#0a0a0c] overflow-hidden">
            {/* Header */}
            <div className="px-5 py-3.5 border-b border-white/5 bg-white/[0.02] flex items-center justify-between">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-500/60">Transmission Sequence</span>
                <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">{seasonBoundaries.length} SEASONS</span>
            </div>

            {/* List */}
            <div ref={episodeListRef} className="flex-1 overflow-y-auto custom-scrollbar">
                {seasonBoundaries.map((season, sIdx) => {
                    const isSeasonActive = activeEpisodeIdx >= season.start && activeEpisodeIdx < season.end;
                    const seasonEps = Array.from({ length: season.end - season.start }, (_, i) => season.start + i);

                    return (
                        <div key={sIdx} className="flex flex-col border-b last:border-b-0 border-white/5">
                            <div className={`px-5 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-md transition-colors ${isSeasonActive ? 'bg-blue-600/10' : 'bg-[#0a0a0c]/90'}`}>
                                <div className="flex items-center gap-3">
                                    <div className={`w-1.5 h-1.5 rounded-full ${isSeasonActive ? 'bg-blue-500 animate-pulse' : 'bg-gray-700'}`} />
                                    <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${isSeasonActive ? 'text-white' : 'text-gray-500'}`}>
                                        {season.name}
                                    </span>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-[8px] font-bold text-gray-700 uppercase tracking-widest">
                                        {seasonEps.length} EPISODES
                                    </span>
                                    <ChevronDown className={`w-3 h-3 text-gray-700 transition-transform ${isSeasonActive ? 'rotate-0' : '-rotate-90'}`} />
                                </div>
                            </div>

                            {isSeasonActive && (
                                <div className="bg-white/[0.01]">
                                    {seasonEps.map((globalIdx) => {
                                        const isPlaying = activeEpisodeIdx === globalIdx;
                                        const currentEpNum = globalIdx - season.start + 1;
                                        const epData = streamingLinks?.[activeServerIdx]?.server_data?.[globalIdx];

                                        return (
                                            <button
                                                key={globalIdx}
                                                onClick={() => setActiveEpisodeIdx(globalIdx)}
                                                className={`w-full px-8 py-3 flex items-center gap-4 transition-all border-l-2 ${isPlaying ? 'bg-blue-600/20 border-blue-500 shadow-inner' : 'border-transparent hover:bg-white/[0.04] group'}`}
                                            >
                                                <div className={`w-7 h-7 shrink-0 rounded-lg flex items-center justify-center transition-all ${isPlaying ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-gray-600 group-hover:bg-white/10'}`}>
                                                    {isPlaying ? <Play className="w-2.5 h-2.5 fill-current" /> : <span className="text-[9px] font-black">{String(currentEpNum).padStart(2, '0')}</span>}
                                                </div>
                                                <div className="flex flex-col items-start min-w-0 overflow-hidden">
                                                    <MarqueeText
                                                        text={epData?.name || `Episode ${String(currentEpNum).padStart(2, '0')}`}
                                                        className={`text-[10px] font-bold uppercase tracking-wider ${isPlaying ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'}`}
                                                    />
                                                    <div className="flex items-center gap-2 mt-0.5">
                                                        <span className="text-[7px] font-black text-gray-600 uppercase tracking-widest">
                                                            {activeType} Stream {epData?.provider ? `via ${epData.provider}` : ''}
                                                        </span>
                                                        {isPlaying && <span className="text-[6px] px-1 bg-blue-500/20 text-blue-400 rounded uppercase font-black">Active</span>}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
