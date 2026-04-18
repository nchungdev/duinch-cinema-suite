import React, { forwardRef, useRef } from 'react';
import { Loader2, Zap, Activity } from 'lucide-react';
import { useMovieDetail } from './MovieDetailContext';
import { useHlsPlayer } from '../../hooks/useHlsPlayer';

export const MediaStreamer = forwardRef<HTMLDivElement>((_, containerRef) => {
    const { 
        activeEmbed, isTorrentStreaming, isFshareResolving,
        activeType, activeProvider, streamableSources,
        isPlayerReady, playerError
    } = useMovieDetail();
    
    const videoRef = useRef<HTMLVideoElement>(null);
    useHlsPlayer(videoRef);

    const isInternalLoading = isTorrentStreaming || isFshareResolving;
    const showLoadingOverlay = (isInternalLoading || (!!activeEmbed && !activeEmbed.includes('iframe') && !isPlayerReady)) && !playerError;

    return (
        <div ref={containerRef} className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/5 group">
            {activeEmbed ? (
                <>
                    {activeEmbed.includes('iframe') || activeType === 'EMBED' ? (
                        <iframe
                            src={activeEmbed}
                            className="w-full h-full border-0"
                            allowFullScreen
                            allow="autoplay; encrypted-media"
                        />
                    ) : (
                        <video
                            ref={videoRef}
                            className="w-full h-full object-contain"
                            controls
                            autoPlay
                        />
                    )}

                    {/* Loading Overlay */}
                    {showLoadingOverlay && (
                        <div className="absolute inset-0 bg-[#0a0a0c]/90 backdrop-blur-xl flex flex-col items-center justify-center z-30 animate-in fade-in duration-500">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
                                <Loader2 className="w-12 h-12 text-blue-500 animate-spin relative z-10" />
                            </div>
                            <div className="mt-8 text-center space-y-2">
                                <h3 className="text-xl font-black text-white uppercase tracking-[0.2em]">
                                    {isTorrentStreaming ? 'Igniting P2P Engine' : 
                                     isFshareResolving ? 'Resolving Cloud Link' : 'Synchronizing Stream'}
                                </h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest animate-pulse">
                                    {isTorrentStreaming ? 'Establishing peer connections...' : 
                                     isFshareResolving ? 'Bypassing Fshare restrictions...' : 'Buffering media segments...'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Error Overlay */}
                    {playerError && (
                        <div className="absolute inset-0 bg-[#0a0a0c]/90 backdrop-blur-xl flex flex-col items-center justify-center z-30 animate-in fade-in duration-500">
                            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-6">
                                <Activity className="w-8 h-8 text-red-500" />
                            </div>
                            <div className="text-center space-y-2">
                                <h3 className="text-lg font-black text-white uppercase tracking-widest">Transmission Failure</h3>
                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em] max-w-xs">{playerError}</p>
                            </div>
                            <button 
                                onClick={() => window.location.reload()}
                                className="mt-8 px-6 py-2 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white transition-all"
                            >
                                Reset System
                            </button>
                        </div>
                    )}

                </>
            ) : (
                <div className="w-full h-full flex flex-col items-center justify-center space-y-6">
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-600/10 blur-3xl rounded-full" />
                        <div className="w-20 h-20 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center relative z-10">
                            <Zap className="w-8 h-8 text-gray-600" />
                        </div>
                    </div>
                    <div className="text-center">
                        <h3 className="text-sm font-black text-gray-500 uppercase tracking-[0.3em]">System Standby</h3>
                        <p className="text-[10px] text-gray-700 uppercase tracking-widest mt-2 font-bold">Waiting for selection...</p>
                    </div>
                </div>
            )}
        </div>
    );
});

MediaStreamer.displayName = 'MediaStreamer';
