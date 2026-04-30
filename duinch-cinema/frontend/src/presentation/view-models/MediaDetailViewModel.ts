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

  // Logic: Điều hướng luồng phát (Navigation & Link Selection)
  useEffect(() => {
    // NẾU CHƯA CÓ DỮ LIỆU TỪ DISCOVERY ENGINE -> KHÔNG TỰ Ý CHỌN LINK
    if (!isInitialized || !streamableSources || Object.keys(streamableSources).length === 0) {
        return;
    }

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
                    servers.push({
                        ...srv,
                        server_data: srv.episodes || srv.server_data || [],
                        season: col.order
                    });
                });
            });
        } else {
            servers = rawData;
        }

        const server = servers[result.serverIdx];
        if (!server?.server_data) return;

        const currentSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
        const targetSeasonNum = currentSeason?.season_number;
        const globalEpNum = activeEpisodeIdx + 1; // SỬ DỤNG SỐ TẬP TUYỆT ĐỐI (CONTINUOUS)
        
        const extractNum = (name: string) => { 
            if (!name) return null;
            const digits = name.toString().replace(/\D/g, ''); 
            return digits ? parseInt(digits) : null; 
        };
        
        let ep = (server.server_data || []).find((item: any) => {
            const itemSeason = item.season || server.season;
            const isMatchSeason = mediaType !== 'tv' || Number(itemSeason) === targetSeasonNum;
            if (!isMatchSeason) return false;

            const num = extractNum(item.name);
            // Ưu tiên khớp số tuyệt đối, nếu không được thì thử số tương đối (localEpNum)
            const localEpNum = currentSeason ? (activeEpisodeIdx - currentSeason.start + 1) : globalEpNum;
            return num !== null && (num === globalEpNum || num === localEpNum);
        });

        if (!ep) ep = server.server_data[0];

        if (ep) {
            const link = new StreamLink(ep);
            const targetUrl = result.type === 'HLS' ? link.hlsUrl : link.embedUrl;
            const finalUrl = targetUrl || link.bestUrl;
            
            if (finalUrl && finalUrl !== activeEmbed) {
                console.log(`[Player] Absolute Ep ${globalEpNum} Selection Updated -> ${finalUrl}`);
                setActiveEmbed(finalUrl);
            }
        }
    }
  }, [isInitialized, streamableSources, activeEpisodeIdx, userSettings]);

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
