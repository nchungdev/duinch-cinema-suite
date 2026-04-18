import React from 'react';
import { Play, Loader2 } from 'lucide-react';
import { MarqueeText } from '../MarqueeText';
import { useMovieDetail } from './MovieDetailContext';
import { useStreamResolvers } from '../../hooks/useStreamResolvers';

export const MovieGallery = () => {
    const { 
        streamingLinks, activeServerIdx, activeEpisodeIdx, setActiveEpisodeIdx,
        isTorrentStreaming, isFshareResolving, userSettings, setActiveServerIdx
    } = useMovieDetail();
    const { handleTorrentStream, handleFshareStream } = useStreamResolvers();

    return (
        <div className="flex flex-col h-full bg-[#0a0a0c]">
            <div className="px-5 py-3.5 border-b border-white/5 bg-white/[0.02]">
                <span className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-500/60">Available Transmissions</span>
            </div>
            
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar">
                {streamingLinks.map((server, srvIdx) => (
                    <div key={srvIdx} className="flex flex-col border-b last:border-b-0 border-white/5">
                        {server.server_data.map((ep: any, epIdx: number) => {
                            const isPlaying = activeServerIdx === srvIdx && activeEpisodeIdx === epIdx;
                            const isFshare = ep.source_type === 'fshare' || ep.url?.includes('fshare.vn');
                            if (isFshare && !userSettings?.fshare_session) return null;

                            const isLoading = isPlaying && (isTorrentStreaming || isFshareResolving);

                            return (
                                <div key={epIdx} className={`flex items-stretch overflow-hidden transition-all duration-300 ${isPlaying ? 'bg-blue-600/20 shadow-inner' : 'hover:bg-white/[0.04] group/ep'}`}>
                                    <button 
                                        disabled={isLoading}
                                        onClick={() => {
                                            if (ep.isTorrent) {
                                                handleTorrentStream(ep.magnet, server.server_name, epIdx, srvIdx);
                                            } else if (isFshare) {
                                                handleFshareStream(ep.url, server.server_name, epIdx, srvIdx);
                                            } else {
                                                setActiveServerIdx(srvIdx);
                                                setActiveEpisodeIdx(epIdx);
                                                localStorage.setItem('omv_active_server_name', server.server_name);
                                            }
                                        }}
                                        className="flex-1 min-w-0 flex items-center gap-4 px-5 py-4 overflow-hidden"
                                    >
                                        <div className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center transition-all duration-500 ${isPlaying ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-gray-500 group-hover/ep:bg-white/10'}`}>
                                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className={`w-3 h-3 ${isPlaying ? 'fill-current' : ''}`} />}
                                        </div>
                                        <div className="flex flex-col items-start min-w-0 overflow-hidden flex-1">
                                            <MarqueeText
                                                text={ep.name || server.server_name}
                                                className={`text-[11px] font-black uppercase tracking-[0.15em] ${isPlaying ? 'text-white' : 'text-gray-300'}`}
                                            />
                                            <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest mt-1 truncate w-full">
                                                {ep.stream_type} via {ep.scraper || ep.provider || 'Unknown'}
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
    );
};
