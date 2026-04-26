import { useEffect, useCallback } from 'react';
import { api } from '../../api/config';
import { useMediaDetail } from '../context/MediaDetailContext';
import { SelectBestStream } from '../../core/use-cases/SelectBestStream';
import { StreamLink, type StreamType, type RawLinkData } from '../../domain/models/StreamLink';
import type { StreamingEpisode, StreamingServer } from '../../api/config';

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
    initialSeason, initialEpisode
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
                
                let targetServer = next[type][platform].find((s: StreamingServer) => s.server_name === serverKey);
                if (!targetServer) {
                    targetServer = { server_name: serverKey, server_data: [] };
                    next[type][platform].push(targetServer);
                }

                const epName = link.name;
                const existingEp = targetServer.server_data.find((e: StreamingEpisode) => e.name === epName);

                if (existingEp) {
                    if (link.hlsUrl)   existingEp.m3u8 = link.hlsUrl;
                    if (link.embedUrl) existingEp.embed = link.embedUrl;
                    if (link.isP2P)    existingEp.magnet = url;
                    if (link.isDirect) existingEp.url = url;
                } else {
                    targetServer.server_data.push({
                        name: epName,
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

  // Logic: Điều hướng luồng phát (Navigation & Link Selection)
  useEffect(() => {
    // NẾU CHƯA CÓ DỮ LIỆU TỪ DISCOVERY ENGINE -> KHÔNG TỰ Ý CHỌN LINK
    if (!streamableSources || Object.keys(streamableSources).length === 0) {
        return;
    }

    const selector = new SelectBestStream();
    const result = selector.execute(
        streamableSources, 
        userSettings?.preferred_source || 'auto',
        activeType,
        activeProvider
    );

    if (result) {
        if (result.type !== activeType) setActiveType(result.type);
        if (result.provider !== activeProvider) setActiveProvider(result.provider);
        
        const servers = streamableSources[result.type]?.[result.provider] || [];
        if (!servers.length) return;

        // Prefer the saved server name; fall back to activeServerIdx
        const preferredServerName = userSettings?.preferred_server as string | undefined;
        let serverIdx = preferredServerName
            ? servers.findIndex((s: any) => s.server_name === preferredServerName)
            : -1;
        if (serverIdx < 0) serverIdx = Math.min(activeServerIdx, servers.length - 1);
        const server = servers[serverIdx];
        if (!server?.server_data) return;

        // Unified URL selection logic
        const currentSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
        const localEpNum = currentSeason ? (activeEpisodeIdx - currentSeason.start + 1) : (activeEpisodeIdx + 1);
        
        const extractNum = (name: string) => { 
            if (!name) return null;
            const digits = name.toString().replace(/\D/g, ''); 
            return digits ? parseInt(digits) : null; 
        };
        
        let ep = server.server_data.find((item: StreamingEpisode) => {
            const num = extractNum(item.name);
            return num !== null && num === localEpNum;
        });

        if (!ep) {
            const globalEpNum = activeEpisodeIdx + 1;
            ep = server.server_data.find((item: StreamingEpisode) => {
                const num = extractNum(item.name);
                return num !== null && num === globalEpNum;
            });
        }
        
        if (!ep) ep = server.server_data[activeEpisodeIdx];

        if (ep) {
            const link = new StreamLink(ep);
            const targetUrl = result.type === 'HLS' ? link.hlsUrl : link.embedUrl;
            const finalUrl = targetUrl || link.bestUrl;
            
            if (finalUrl && finalUrl !== activeEmbed) {
                console.log(`[ViewModel] Selection Update -> Ep ${localEpNum} (${result.provider}):`, finalUrl);
                setActiveEmbed(finalUrl);
            }
        }
        
        setStreamingLinks(servers);
        if (serverIdx !== activeServerIdx) setActiveServerIdx(serverIdx);
    }
  }, [streamableSources, userSettings, activeType, activeProvider, activeServerIdx, activeEpisodeIdx, seasonBoundaries, setActiveType, setActiveProvider, setStreamingLinks, setActiveServerIdx, setActiveEmbed, activeEmbed, streamingLinks.length]);

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
