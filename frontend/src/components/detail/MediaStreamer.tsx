import React, { forwardRef, useRef, useEffect } from 'react';
import { Loader2, Zap, Activity } from 'lucide-react';
import { useMovieDetail } from './MovieDetailContext';
import { useHlsPlayer } from '../../hooks/useHlsPlayer';

export const MediaStreamer = forwardRef<HTMLDivElement>((_, containerRef) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const dailymotionPollRef = useRef<number | null>(null);
    
    const { 
        activeEmbed, activeType, activeProvider,
        isPlayerReady, playerError, slug, mediaType, activeEpisodeIdx
    } = useMovieDetail();
    
    useHlsPlayer(videoRef);

    // Definite Switch based on stream type
    const isEmbedMode = activeType !== 'HLS';

    // Unique key for this video content
    const progressKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}_${activeProvider}`;
    // Common key for episode (shared across providers for cross-source sync)
    const commonKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}`;

    // Attempt to inject time into iframe URL and enable Dailymotion API
    const getFinalEmbedUrl = () => {
        if (!activeEmbed || !isEmbedMode) return activeEmbed;
        try {
            const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
            
            // First try provider-specific progress, then fallback to common episode progress
            let saved = progressStore[progressKey] || progressStore[commonKey];
            
            const url = new URL(activeEmbed);
            
            // Inject start time if available
            if (saved && saved.time > 0) {
                url.searchParams.set('t', Math.floor(saved.time).toString());
                url.searchParams.set('start', Math.floor(saved.time).toString());
            }
            
            // Ensure Dailymotion iframe has postMessage API enabled for time sync
            if (url.hostname.includes('dailymotion.com')) {
                url.searchParams.set('api', 'postMessage');
            }
            
            return url.toString();
        } catch (e) {
            console.warn('[Player] Failed to inject time to iframe URL:', e);
        }
        return activeEmbed;
    };

    const showLoadingOverlay = (!!activeEmbed && !isEmbedMode && !isPlayerReady) && !playerError;

    // Log the active streaming link whenever it changes
    useEffect(() => {
        if (activeEmbed) {
            console.clear();
            console.log("%c[CinemaPro] 🚀 STREAMING INITIALIZED", "color: #3b82f6; font-weight: bold; font-size: 12px;");
            console.log("%cSource Type:", "color: #9ca3af;", activeType);
            console.log("%cProvider:   ", "color: #9ca3af;", activeProvider);
            console.log("%cTarget URL: ", "color: #9ca3af;", activeEmbed);
        }
    }, [activeEmbed, activeType, activeProvider]);

    // Dailymotion embed time synchronization via postMessage API
    useEffect(() => {
        if (!activeEmbed || !isEmbedMode) return;
        const isDailymotion = activeEmbed.includes('dailymotion.com');
        if (!isDailymotion) return;

        const iframe = iframeRef.current;
        if (!iframe) return;

        const sendGetCurrentTime = () => {
            try {
                iframe.contentWindow?.postMessage(
                    JSON.stringify({
                        event: 'command',
                        method: 'getCurrentTime',
                        id: 'player'
                    }),
                    '*'
                );
            } catch (e) {
                console.warn('[EmbedSync] Failed to send getCurrentTime:', e);
            }
        };

        const handleMessage = (event: MessageEvent) => {
            let data: any;
            try {
                data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            } catch {
                return;
            }
            if (!data || data.event !== 'info' || data.type !== 'time' || data.id !== 'player') return;
            const time = data.value;
            if (typeof time !== 'number') return;

            // Save progress (both provider-specific and common)
            try {
                const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
                const progressKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}_${activeProvider}`;
                const commonKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}`;
                const progress = { time, updated_at: Date.now() };
                progressStore[progressKey] = progress;
                progressStore[commonKey] = progress;
                localStorage.setItem('omv_watch_progress', JSON.stringify(progressStore));
            } catch (e) {
                console.warn('[EmbedSync] Failed to save progress:', e);
            }
        };

        window.addEventListener('message', handleMessage);
        // Poll for time every 10 seconds, start after 2 seconds to let player initialize
        dailymotionPollRef.current = window.setInterval(sendGetCurrentTime, 10000);
        const initialTimer = setTimeout(sendGetCurrentTime, 2000);

        return () => {
            window.removeEventListener('message', handleMessage);
            if (dailymotionPollRef.current) clearInterval(dailymotionPollRef.current);
            clearTimeout(initialTimer);
        };
    }, [activeEmbed, isEmbedMode, slug, mediaType, activeEpisodeIdx, activeProvider]);

    const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        if (video.currentTime > 5) {
            const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
            const current = progressStore[progressKey] || {};
            
            if (Math.abs((current.time || 0) - video.currentTime) > 5) {
                const progress = { time: video.currentTime, updated_at: Date.now() };
                progressStore[progressKey] = progress;
                progressStore[commonKey] = progress;
                localStorage.setItem('omv_watch_progress', JSON.stringify(progressStore));
            }
        }
    };

    return (
        <div ref={containerRef} className="relative w-full aspect-video bg-black rounded-3xl overflow-hidden shadow-2xl border border-white/5 group">
            {activeEmbed ? (
                <>
                    {isEmbedMode ? (
                        <iframe
                            key={getFinalEmbedUrl()}
                            src={getFinalEmbedUrl() || ''}
                            ref={iframeRef}
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
                            onTimeUpdate={handleTimeUpdate}
                        />
                    )}

                    {/* Transmission Info Bar */}
                    <div className="absolute top-4 right-4 z-40 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                        <div className="flex items-center gap-3 px-3 py-1.5 bg-[#0a0a0c]/80 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl">
                             <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_#3b82f6]" />
                             <div className="flex flex-col items-start">
                                <span className="text-[7px] font-black text-gray-500 uppercase tracking-[0.2em]">Transmission Active</span>
                                <span className="text-[9px] font-black text-white uppercase tracking-widest">
                                    {activeType} • {activeProvider}
                                </span>
                             </div>
                        </div>
                    </div>

                    {/* Loading Overlay */}
                    {showLoadingOverlay && (
                        <div className="absolute inset-0 bg-[#0a0a0c]/90 backdrop-blur-xl flex flex-col items-center justify-center z-30 animate-in fade-in duration-500">
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500/20 blur-3xl rounded-full" />
                                <Loader2 className="w-12 h-12 text-blue-500 animate-spin relative z-10" />
                            </div>
                            <div className="mt-8 text-center space-y-2">
                                <h3 className="text-xl font-black text-white uppercase tracking-[0.2em]">Synchronizing Stream</h3>
                                <p className="text-xs text-gray-500 font-bold uppercase tracking-widest animate-pulse">Buffering media segments...</p>
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
