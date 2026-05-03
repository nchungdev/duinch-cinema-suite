import React, { forwardRef, useRef, useEffect, useState } from 'react';
import { Loader2, Zap, Activity, Settings, ChevronRight, Pin } from 'lucide-react';
import { useMediaDetail, PlaybackState } from '../../context/MediaDetailContext';
import { usePlaybackController } from '../../view-models/PlaybackController';
import { api } from '../../../api/config';

export const MediaStreamer = forwardRef<HTMLDivElement>((_, containerRef) => {
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const dailymotionPollRef = useRef<number | null>(null);
    const [overlayOpen, setOverlayOpen] = useState(false);

    const {
        videoRef,
        activeEmbed, activeType, activeProvider, activeServerIdx,
        isPlayerReady, playerError, slug, mediaType, activeEpisodeIdx,
        streamableSources, setActiveType, setActiveProvider, setActiveServerIdx,
        setActiveEmbed, seasonBoundaries, userSettings, setUserSettings,
        setPlaybackState,
    } = useMediaDetail();
    const embedFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // ── Player-level server switcher ─────────────────────────────────────
    const savePreferredSource = async (type: string, provider: string, audio?: string, serverName?: string) => {
        const next = { 
            ...(userSettings || {}), 
            preferred_type: type,
            preferred_provider: provider,
            preferred_audio: audio,
            preferred_server: serverName
        };
        setUserSettings(next);
        try { await api.post('/user/settings', { 
            preferred_type: type,
            preferred_provider: provider,
            preferred_audio: audio,
            preferred_server: serverName
        }); } catch {}
    };

    // Compute local episode number so we can find the right episode object
    const activeSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
    const localEpNum = activeSeason ? activeEpisodeIdx - activeSeason.start + 1 : activeEpisodeIdx + 1;
    const extractNum = (name: string) => { const d = name?.toString().replace(/\D/g, ''); return d ? parseInt(d) : null; };

    const switchServer = (type: string, provider: string, srvIdx: number, server: any) => {
        const ep = (server.server_data || []).find((e: any) => extractNum(e.name) === localEpNum)
                ?? server.server_data?.[0];
        if (!ep) return;
        const link = type === 'HLS' ? (ep.m3u8 || ep.url) : (ep.embed || ep.url || ep.m3u8);
        if (!link) return;
        setActiveType(type);
        setActiveProvider(provider);
        setActiveServerIdx(srvIdx);
        setActiveEmbed(link);
        // Temporary for current ep: DO NOT call savePreferredSource here
        setOverlayOpen(false);
    };

    // Filtered list: Only servers containing the current episode
    const allServers = Object.entries(streamableSources).flatMap(([type, providers]) =>
        Object.entries(providers as any).flatMap(([provider, rawList]) => {
            const items = rawList as any[];
            return items
                .map((server, srvIdx) => ({ type, provider, srvIdx, server }))
                .filter(({ server }) => {
                    // Match current episode (same strict logic as TVGallery)
                    return (server.server_data || []).some((e: any) => extractNum(e.name) === localEpNum);
                });
        })
    );
    const preferredServer = (userSettings as any)?.preferred_server as string | undefined;
    
    // Find current server name safely
    const currentProviderServers = streamableSources[activeType]?.[activeProvider] || [];
    const currentServerName = currentProviderServers[activeServerIdx]?.server_name || '';
    
    usePlaybackController();

    // Definite Switch based on stream type
    const isEmbedMode = activeType !== 'HLS';

    // Progress key: per-episode, shared across all providers/servers
    const progressKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}`;

    // Attempt to inject time into iframe URL and enable Dailymotion API
    const getFinalEmbedUrl = () => {
        if (!activeEmbed || !isEmbedMode) return activeEmbed;
        try {
            const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
            const saved = progressStore[progressKey];
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
        }
    }, [activeEmbed]);

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

            try {
                const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
                progressStore[`${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}`] = { time, updated_at: Date.now() };
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

    // Embed playback state: khi load embed mới → buffering, fallback → playing sau 3s
    useEffect(() => {
        if (!activeEmbed || !isEmbedMode) return;
        setPlaybackState(PlaybackState.Buffering);
        if (embedFallbackRef.current) clearTimeout(embedFallbackRef.current);
        // Sau 3s giả định embed đã playing (không thể detect từ cross-origin iframe)
        embedFallbackRef.current = setTimeout(() => setPlaybackState(PlaybackState.Playing), 3000);
        return () => {
            if (embedFallbackRef.current) clearTimeout(embedFallbackRef.current);
        };
    }, [activeEmbed, isEmbedMode, setPlaybackState]);

    // Dailymotion play/pause state via postMessage events
    useEffect(() => {
        if (!activeEmbed || !isEmbedMode) return;
        if (!activeEmbed.includes('dailymotion.com')) return;

        const handleDMState = (event: MessageEvent) => {
            let data: any;
            try { data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data; }
            catch { return; }
            if (!data) return;
            // Dailymotion postMessage events: { event: 'play' | 'pause' | 'buffering' | 'end' }
            if (data.event === 'play')           setPlaybackState(PlaybackState.Playing);
            else if (data.event === 'pause')     setPlaybackState(PlaybackState.Paused);
            else if (data.event === 'buffering') setPlaybackState(PlaybackState.Buffering);
            else if (data.event === 'end')       setPlaybackState(PlaybackState.Stopped);
        };

        window.addEventListener('message', handleDMState);
        return () => window.removeEventListener('message', handleDMState);
    }, [activeEmbed, isEmbedMode, setPlaybackState]);

    const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
        const video = e.currentTarget;
        if (video.currentTime > 5) {
            const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
            const current = progressStore[progressKey] || {};
            if (Math.abs((current.time || 0) - video.currentTime) > 5) {
                progressStore[progressKey] = { time: video.currentTime, updated_at: Date.now() };
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
                            allow="autoplay; encrypted-media; fullscreen"
                            referrerPolicy="no-referrer"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-presentation allow-popups"
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

                    {/* Source Switcher Overlay */}
                    <div className={`absolute top-4 right-4 z-50 transition-opacity duration-500 ${overlayOpen ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                        <div className="relative">
                            {/* Info pill + gear button */}
                            <button
                                onClick={() => setOverlayOpen(o => !o)}
                                className={`flex items-center gap-2.5 pl-3 pr-2.5 py-1.5 rounded-xl border backdrop-blur-xl shadow-2xl transition-all ${
                                    overlayOpen
                                        ? 'bg-blue-600/20 border-blue-500/60 text-white'
                                        : 'bg-[#0a0a0c]/80 border-white/10 text-gray-300 hover:border-white/30'
                                }`}
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_#3b82f6] shrink-0" />
                                <div className="flex flex-col items-start leading-none">
                                    <span className="text-[6px] font-black text-gray-500 uppercase tracking-[0.2em]">Active Source</span>
                                    <span className="text-[9px] font-black text-white uppercase tracking-widest mt-0.5">
                                        {activeType || '—'} · {activeProvider || '—'}
                                    </span>
                                </div>
                                <Settings className={`w-3 h-3 ml-1 shrink-0 transition-transform ${overlayOpen ? 'rotate-45 text-blue-400' : 'text-gray-500'}`} />
                            </button>

                            {/* Server list popup */}
                            {overlayOpen && allServers.length > 0 && (
                                <div className="absolute top-full right-0 mt-2 w-72 bg-[#0c0c0e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                                    <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                                        <span className="text-[7px] font-black uppercase tracking-[0.3em] text-blue-500">Switch Source</span>
                                        <span className="text-[7px] text-gray-600 font-bold">{allServers.length} servers</span>
                                    </div>
                                    <div className="max-h-72 overflow-y-auto custom-scrollbar p-2 space-y-0.5">
                                        {Object.entries(
                                            allServers.reduce((acc, s) => {
                                                const k = `${s.type}:${s.provider}`;
                                                if (!acc[k]) acc[k] = [];
                                                acc[k].push(s);
                                                return acc;
                                            }, {} as Record<string, typeof allServers>)
                                        ).map(([groupKey, servers]) => {
                                            const [type, provider] = groupKey.split(':');
                                            return (
                                                <div key={groupKey} className="mb-1">
                                                    <div className="flex items-center gap-2 px-2 py-1">
                                                        <div className={`w-1 h-1 rounded-full ${type === 'HLS' ? 'bg-orange-500' : type === 'EMBED' ? 'bg-blue-500' : 'bg-green-500'}`} />
                                                        <span className="text-[7px] font-black text-gray-600 uppercase tracking-widest">{type} · {provider}</span>
                                                    </div>
                                                    {servers.map(({ srvIdx, server }) => {
                                                        const isActive = activeType === type && activeProvider === provider && activeServerIdx === srvIdx;
                                                        
                                                        const preferredType = (userSettings as any)?.preferred_type;
                                                        const preferredProvider = (userSettings as any)?.preferred_provider;
                                                        const preferredAudio = (userSettings as any)?.preferred_audio;
                                                        const preferredServerName = (userSettings as any)?.preferred_server;

                                                        const isPinned = preferredType === type && preferredProvider === provider 
                                                                        && preferredAudio === server.audio_type && preferredServerName === server.server_name;

                                                        return (
                                                            <div key={`${type}-${provider}-${srvIdx}`} className="flex items-center gap-2 group/item pr-2">
                                                                 <button
                                                                     onClick={() => switchServer(type, provider, srvIdx, server)}
                                                                     className={`flex-1 flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all border text-left ${
                                                                         isActive
                                                                             ? 'bg-blue-600/10 border-blue-500/50 shadow-[0_0_20px_rgba(59,130,246,0.15)]'
                                                                             : 'bg-black/20 border-transparent hover:border-white/10 hover:bg-white/[0.05]'
                                                                     }`}
                                                                 >
                                                                     <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all border shrink-0 ${
                                                                         isActive ? 'bg-blue-600 border-blue-500 shadow-lg text-white' : 'bg-white/5 border-white/5 text-gray-500 group-hover/item:text-blue-400'
                                                                     }`}>
                                                                         {type === 'HLS' ? <Zap className="w-4 h-4" /> : 
                                                                          type === 'EMBED' ? <Layout className="w-4 h-4" /> : <Box className="w-4 h-4" />}
                                                                     </div>
                                                                     <div className="flex flex-col min-w-0 flex-1">
                                                                         <div className="flex items-center gap-2">
                                                                             <span className={`text-[10px] font-black uppercase tracking-widest truncate ${isActive ? 'text-blue-400' : 'text-gray-300'}`}>
                                                                                 {server.server_name}
                                                                             </span>
                                                                             {server.audio_type && (
                                                                                 <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[7px] font-black uppercase tracking-widest ${
                                                                                     server.audio_type === 'Lồng Tiếng' 
                                                                                         ? 'bg-pink-600/20 text-pink-400 border-pink-500/20' 
                                                                                         : 'bg-green-600/20 text-green-400 border-green-500/20'
                                                                                 }`}>
                                                                                     {server.audio_type}
                                                                                 </span>
                                                                             )}
                                                                         </div>
                                                                         <div className="flex items-center gap-2 mt-0.5">
                                                                             <span className="px-1.5 py-0.5 rounded bg-blue-600/20 border border-blue-500/20 text-blue-400 text-[6px] font-black uppercase tracking-widest">
                                                                                 {provider.toUpperCase()}
                                                                             </span>
                                                                             <span className="text-[7px] font-bold text-gray-600 uppercase tracking-widest">
                                                                                 {server.server_data?.length ?? 0} EPS
                                                                             </span>
                                                                         </div>
                                                                     </div>
                                                                     {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6] shrink-0" />}
                                                                 </button>
                                                                 <button
                                                                     onClick={(e) => {
                                                                         e.stopPropagation();
                                                                         savePreferredSource(type, provider, server.audio_type, server.server_name);
                                                                     }}
                                                                     className={`p-2.5 rounded-xl transition-all border ${
                                                                         isPinned 
                                                                         ? 'bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.2)]' 
                                                                         : 'bg-white/5 border-white/5 text-gray-600 hover:text-amber-400 hover:border-amber-500/30 opacity-0 group-hover/item:opacity-100'
                                                                     }`}
                                                                     title={isPinned ? 'Đã ghim' : 'Ghim làm mặc định'}
                                                                 >
                                                                     <Pin className={`w-3 h-3 ${isPinned ? 'fill-current' : ''}`} />
                                                                 </button>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Click outside to close */}
                            {overlayOpen && (
                                <div className="fixed inset-0 z-[-1]" onClick={() => setOverlayOpen(false)} />
                            )}
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
