import { useEffect, useCallback } from 'react';
import { api } from '@shared/api/config';
import { useMediaDetail } from '../context/MediaDetailContext';
import { SelectBestStream } from '@shared/core/use-cases/SelectBestStream';
import { StreamLink, type StreamType, type RawLinkData } from '@shared/domain/models/StreamLink';
import type { StreamingEpisode, StreamingServer } from '@shared/api/config';

/**
 * ViewModel: MediaDetailViewModel
 * Người đại diện (Presenter) duy nhất cho View chi tiết phim.
 * Gom tất cả logic điều hướng và đăng ký luồng phát.
 * Dữ liệu (Metadata/Settings) được quản lý tập trung bởi MediaDetailContext.
 */
export const useMediaDetailViewModel = () => {
  const context = useMediaDetail();
  
  const { 
    slug, mediaType, media, 
    loading, setLoading, 
    userSettings, setUserSettings,
    streamableSources, setStreamableSources,
    activeType, setActiveType,
    activeProvider, setActiveProvider,
    activeServerIdx, setActiveServerIdx,
    activeEpisodeIdx, setActiveEpisodeIdx,
    activeSeasonIdx, setActiveSeasonIdx,
    streamingLinks, setStreamingLinks,
    activeEmbed, setActiveEmbed,
    setIsPlayerReady,
    setPlayerError,
    onBack, seasonBoundaries,
    initialSeason, initialEpisode, isInitialized
  } = context;

  // Logic: Đăng ký luồng phát (Registry)
  const handleStreamingReady = useCallback((links: RawLinkData[], sourceId: string) => {
    setStreamableSources(prev => {
        const next = { ...prev };
        
        // Reset current provider's data in next to ensure full sync with UI
        Object.keys(next).forEach(type => {
            if (next[type] && next[type][sourceId]) {
                next[type][sourceId] = [];
            }
        });

        for (const rawData of links) {
            const link = new StreamLink({ ...rawData, provider: rawData.provider || sourceId });
            const url = link.bestUrl;
            if (!url) continue;

            const supportedTypes: StreamType[] = [];
            if (link.isP2P) supportedTypes.push('P2P');
            else if (link.isDirect) supportedTypes.push('DIRECT');
            else {
                if (link.hlsUrl) supportedTypes.push('HLS');
                if (link.embedUrl) supportedTypes.push('EMBED');
            }

            for (const type of supportedTypes) {
                const platform = link.provider;
                const serverKey = link.server;

                if (!next[type]) next[type] = {};
                if (!next[type][platform]) next[type][platform] = [];
                
                const sSeason = rawData.season || 1;
                const sAudio = rawData.audio_type || undefined;
                
                let targetServer = next[type][platform].find((s: any) => 
                    s.server_name === serverKey && s.season === sSeason && s.audio_type === sAudio
                );
                
                if (!targetServer) {
                    targetServer = { 
                        server_name: serverKey, 
                        audio_type: sAudio,
                        season: sSeason,
                        server_data: [] 
                    };
                    next[type][platform].push(targetServer);
                }

                const epName = link.name;
                const existingEp = targetServer.server_data.find((e: any) => e.name === epName);

                if (existingEp) {
                    if (link.hlsUrl)   existingEp.m3u8 = link.hlsUrl;
                    if (link.embedUrl) existingEp.embed = link.embedUrl;
                    if (link.isP2P)    existingEp.magnet = url;
                    if (link.isDirect) existingEp.url = url;
                } else {
                    targetServer.server_data.push({
                        name: epName,
                        season: sSeason,
                        m3u8: link.hlsUrl || '',
                        embed: link.embedUrl || '',
                        magnet: link.isP2P ? url : '',
                        isTorrent: link.isP2P,
                        stream_type: type,
                        provider: platform,
                        scraper: (rawData.provider || sourceId).toUpperCase(),
                        url: url
                    });
                }
            }
        }
        return next;
    });
  }, [setStreamableSources]);

  // Logic: Điều hướng luồng phát (chỉ dành cho TV)
  // Movie tự quản lý link qua MovieGallery click — không để effect override
  useEffect(() => {
    if (!isInitialized || !streamableSources || Object.keys(streamableSources).length === 0) return;
    if (mediaType !== 'tv') return;

    const selector = new SelectBestStream();
    const result = selector.execute(
        streamableSources, 
        activeEpisodeIdx,
        seasonBoundaries,
        userSettings,
        { type: activeType, provider: activeProvider, serverIdx: activeServerIdx }
    );

    if (result) {
        if (result.type !== activeType) setActiveType(result.type);
        if (result.provider !== activeProvider) setActiveProvider(result.provider);
        if (result.serverIdx !== activeServerIdx) setActiveServerIdx(result.serverIdx);
        
        const rawData = streamableSources[result.type]?.[result.provider] || [];
        let servers: any[] = [];
        if (rawData.length > 0 && 'servers' in rawData[0]) {
            rawData.forEach((col: any) => {
                (col.servers || []).forEach((srv: any) => {
                    servers.push({ ...srv, server_data: srv.episodes || srv.server_data || [], season: col.order });
                });
            });
        } else {
            servers = rawData;
        }

        const server = servers[result.serverIdx];
        if (!server?.server_data) return;

        const currentSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
        const targetSeasonNum = currentSeason?.season_number;
        const globalEpNum = activeEpisodeIdx + 1;
        const localEpNum = currentSeason ? (activeEpisodeIdx - currentSeason.start + 1) : globalEpNum;
        const extractNum = (name: string) => { const d = name?.toString().replace(/\D/g, ''); return d ? parseInt(d) : null; };
        
        let ep = (server.server_data || []).find((item: any) => {
            const itemSeason = item.season || server.season;
            const isMatchSeason = Number(itemSeason) === targetSeasonNum;
            if (!isMatchSeason) return false;
            const num = extractNum(item.name);
            return num !== null && (num === globalEpNum || num === localEpNum);
        });
        if (!ep) ep = server.server_data[0];

        if (ep) {
            const link = new StreamLink(ep);
            const finalUrl = result.type === 'HLS' ? link.hlsUrl : (link.embedUrl || link.bestUrl);
            if (finalUrl && finalUrl !== activeEmbed) setActiveEmbed(finalUrl);
        }
    }
  }, [isInitialized, streamableSources, activeEpisodeIdx, userSettings]);

  // Logic: Auto-select link đầu tiên cho movie (chỉ chạy 1 lần khi có data)
  useEffect(() => {
    if (!isInitialized || !streamableSources || Object.keys(streamableSources).length === 0) return;
    if (mediaType !== 'movie') return;
    if (activeEmbed) return; // Đã có link rồi (user đã chọn hoặc đã init) — không override

    // Tìm server tốt nhất theo preferred settings, fallback về HLS đầu tiên
    const pinnedType     = userSettings?.preferred_type;
    const pinnedProvider = userSettings?.preferred_provider;
    const pinnedAudio    = userSettings?.preferred_audio;
    const pinnedServer   = userSettings?.preferred_server;

    let bestLink: string | null = null;
    let bestScore = -1;

    Object.entries(streamableSources).forEach(([type, providers]) => {
        Object.entries(providers as any).forEach(([provider, rawList]) => {
            (rawList as any[]).forEach((srv: any) => {
                const ep = (srv.server_data || [])[0];
                if (!ep) return;
                const link = type === 'HLS'
                    ? (ep.m3u8 || ep.link_m3u8 || ep.url)
                    : (ep.embed || ep.link_embed || ep.url || ep.m3u8);
                if (!link) return;

                let score = 0;
                if (pinnedType === type) score += 1000;
                if (pinnedProvider === provider) score += 2000;
                if (pinnedAudio === srv.audio_type) score += 1500;
                if (pinnedServer === srv.server_name) score += 3000;
                if (type === 'HLS') score += 500;

                if (score > bestScore) { bestScore = score; bestLink = link; }
            });
        });
    });

    if (bestLink) setActiveEmbed(bestLink);
  }, [isInitialized, streamableSources, userSettings, mediaType, activeEmbed]);

  // Logic: URL Synchronization
  useEffect(() => {
    if (mediaType !== 'tv' || !seasonBoundaries.length || !slug) return;
    
    const activeSeason = seasonBoundaries[activeSeasonIdx];
    if (!activeSeason) return;
    
    const seasonNum = activeSeason.season_number;
    const localEpNum = activeEpisodeIdx - activeSeason.start + 1;
    
    // Check current hash to avoid redundant updates and potential infinite loops
    const currentHash = window.location.hash;
    const [fullPath, queryPart] = currentHash.split('?');
    const params = new URLSearchParams(queryPart || '');
    
    const oldS = params.get('s');
    const oldE = params.get('e');
    
    if (parseInt(oldS || '0') !== seasonNum || parseInt(oldE || '0') !== localEpNum) {
        params.set('s', seasonNum.toString());
        params.set('e', localEpNum.toString());
        
        // Construct the expected base path if we need to be strict, 
        // but usually just updating params on the current path is fine.
        const newHash = `${fullPath}?${params.toString()}`;
        if (window.location.hash !== newHash) {
            window.location.hash = newHash;
        }
    }
  }, [mediaType, activeSeasonIdx, activeEpisodeIdx, seasonBoundaries, slug]);

  const handleFshareLogin = async (email: string, password: string) => {
    try {
        await api.post('/stream/fshare/login', { email, password });
        const res = await api.get('/user/settings');
        if (setUserSettings) setUserSettings(res.data);
        return true;
    } catch {
        return false;
    }
  };

  return {
    state: {
        slug,
        mediaType,
        media,
        loading,
        userSettings,
        streamableSources,
        activeType,
        activeProvider,
        activeServerIdx,
        activeEpisodeIdx,
        activeSeasonIdx,
        streamingLinks,
        activeEmbed,
        seasonBoundaries,
        initialSeason,
        initialEpisode
    },
    actions: {
        setActiveType,
        setActiveProvider,
        setActiveServerIdx,
        setActiveEpisodeIdx,
        setActiveSeasonIdx,
        setActiveEmbed,
        setIsPlayerReady,
        setPlayerError,
        onBack,
        handleStreamingReady,
        handleFshareLogin
    }
  };
};
