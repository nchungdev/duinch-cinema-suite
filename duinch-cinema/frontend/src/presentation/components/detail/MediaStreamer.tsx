import React, { forwardRef, useRef, useEffect, useState } from 'react';
import { Loader2, Zap, Activity, Settings, ChevronRight, Pin } from 'lucide-react';
import { useMediaDetail } from '../../context/MediaDetailContext';
import { usePlaybackController } from '../../view-models/PlaybackController';
import { api } from '../../../api/config';

export const MediaStreamer = forwardRef<HTMLDivElement>((_, containerRef) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const iframeRef = useRef<HTMLIFrameElement>(null);
    const dailymotionPollRef = useRef<number | null>(null);
    const [overlayOpen, setOverlayOpen] = useState(false);

    const {
        activeEmbed, activeType, activeProvider, activeServerIdx,
        isPlayerReady, playerError, slug, mediaType, activeEpisodeIdx,
        streamableSources, setActiveType, setActiveProvider, setActiveServerIdx,
        setActiveEmbed, seasonBoundaries, userSettings, setUserSettings,
    } = useMediaDetail();

    // ── Player-level server switcher ─────────────────────────────────────
    const savePreferred = async (serverName: string, audioType?: string) => {
        const next = { 
            ...(userSettings || {}), 
            preferred_server: serverName,
            preferred_audio_type: audioType
        };
        setUserSettings(next);
        try { await api.post('/user/settings', { 
            preferred_server: serverName,
            preferred_audio_type: audioType
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
        savePreferred(server.server_name, server.audio_type);
        setOverlayOpen(false);
    };

    // Flat list: [{type, provider, srvIdx, server}]
    const allServers = Object.entries(streamableSources).flatMap(([type, providers]) =>
        Object.entries(providers as any).flatMap(([provider, rawList]) => {
            const items = rawList as any[];
            // If it's a list of Collections, flatten them
            if (items.length > 0 && 'servers' in items[0]) {
                const flatServers: any[] = [];
                items.forEach((col: any) => {
                    (col.servers || []).forEach((srv: any) => {
                        flatServers.push({
                            ...srv,
                            server_data: srv.episodes || srv.server_data || [],
                            season: col.order
                        });
                    });
                });
                return flatServers.map((server, srvIdx) => ({ type, provider, srvIdx, server }));
            }
            // Otherwise it's already a flat list of servers
            return items.map((server, srvIdx) => ({ type, provider, srvIdx, server }));
        })
    );
    const preferredServer = (userSettings as any)?.preferred_server as string | undefined;
    
    // Find current server name safely
    const currentProviderServers = streamableSources[activeType]?.[activeProvider] || [];
    const currentServerName = currentProviderServers[activeServerIdx]?.server_name || '';
    
    usePlaybackController(videoRef);

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
            const saved = progressStore[progressKey] || progressStore[commonKey];
            
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
                                                        const isActive = activeType === type && activeProvider === provider
                                                            && (preferredServer === server.server_name || currentServerName === server.server_name);
                                                        const isPinned = preferredServer === server.server_name;
                                                        return (
                                                            <button
                                                                key={srvIdx}
                                                                onClick={() => switchServer(type, provider, srvIdx, server)}
                                                                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-left transition-all ${
                                                                    isActive
                                                                        ? 'bg-blue-600/15 border border-blue-500/30 text-blue-300'
                                                                        : 'text-gray-400 hover:bg-white/5 border border-transparent hover:text-white'
                                                                }`}
                                                            >
                                                                <span className="text-[9px] font-black uppercase tracking-wider truncate">{server.server_name}</span>
                                                                <div className="flex items-center gap-1.5 shrink-0">
                                                                    <span className="text-[7px] text-gray-600">{server.server_data?.length ?? 0} eps</span>
                                                                    {isPinned && <Pin className="w-2.5 h-2.5 text-amber-400" />}
                                                                    {isActive && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_6px_#3b82f6]" />}
                                                                </div>
                                                            </button>
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
