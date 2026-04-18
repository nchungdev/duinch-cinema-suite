import React from 'react';
import { Play, Loader2 } from 'lucide-react';
import { MarqueeText } from '../MarqueeText';
import { useMovieDetail } from './MovieDetailContext';
import { useStreamResolvers } from '../../hooks/useStreamResolvers';

export const MovieGallery = () => {
    const { 
        streamingLinks, activeServerIdx, activeEpisodeIdx, setActiveEpisodeIdx,
        setActiveServerIdx
    } = useMovieDetail();

    return (
        <div className="flex h-full bg-[#0a0a0c] overflow-hidden rounded-3xl border border-white/5 shadow-2xl">
            {/* Main content */}
            <div className="flex-1 flex flex-col min-w-0 border-r border-white/5">
                <div className="px-5 py-3.5 border-b border-white/5 bg-white/[0.02]">
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-500/60">Available Transmissions</span>
                </div>
                
                <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
                    {streamingLinks.map((server, srvIdx) => (
                        <div key={srvIdx} className="flex flex-col border-b last:border-b-0 border-white/5">
                            {server.server_data.map((ep: any, epIdx: number) => {
                                const isPlaying = activeServerIdx === srvIdx && activeEpisodeIdx === epIdx;
                                const hasLink = !!(ep.m3u8 || ep.embed || ep.link_m3u8);

                                return (
                                    <div key={epIdx} className={`flex items-stretch overflow-hidden transition-all duration-300 ${!hasLink ? 'opacity-35 grayscale' : isPlaying ? 'bg-blue-600/20 shadow-inner' : 'hover:bg-white/[0.04] group/ep'}`}>
                                        <button 
                                            disabled={!hasLink}
                                            onClick={() => {
                                                if (!hasLink) return;
                                                setActiveServerIdx(srvIdx);
                                                setActiveEpisodeIdx(epIdx);
                                                localStorage.setItem('omv_active_server_name', server.server_name);
                                            }}
                                            className="flex-1 min-w-0 flex items-center gap-4 px-5 py-4 overflow-hidden"
                                        >
                                            <div className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center transition-all duration-500 ${isPlaying ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-gray-500 group-hover/ep:bg-white/10'}`}>
                                                <Play className={`w-3 h-3 ${isPlaying ? 'fill-current' : ''}`} />
                                            </div>
                                            <div className="flex flex-col items-start min-w-0 overflow-hidden flex-1">
                                                <MarqueeText
                                                    text={ep.name || server.server_name}
                                                    className={`text-[11px] font-black uppercase tracking-[0.15em] ${isPlaying ? 'text-white' : 'text-gray-300'}`}
                                                />
                                                <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest mt-1 truncate w-full">
                                                    {ep.stream_type} via {ep.provider || 'PROVIDER'}
                                                </span>
                                            </div>
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>

            {/* Vertical Side Label */}
            <div className="w-8 flex-shrink-0 bg-white/[0.01] flex items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-blue-500/5 to-transparent opacity-50" />
                <span className="whitespace-nowrap -rotate-90 text-[7px] font-black uppercase tracking-[0.5em] text-gray-700 select-none">
                    Data Transmission Feed
                </span>
            </div>
        </div>
    );
};
