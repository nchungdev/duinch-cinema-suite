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
    if (!isInitialized || !streamableSources || Object.keys(streamableSources).length === 0) {
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
        
        const rawData = streamableSources[result.type]?.[result.provider] || [];
        
        // Support both legacy flat servers and new nested collections
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

        if (!servers.length) return;

        const currentSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
        const targetSeasonNum = currentSeason?.season_number;

        const preferredServerName = userSettings?.preferred_server as string | undefined;
        const preferredAudioType = userSettings?.preferred_audio_type as string | undefined;
        let serverIdx = -1;

        console.log(`[Player] Season: ${targetSeasonNum}, Preferred: ${preferredServerName} (${preferredAudioType})`);

        // 1. Try to find preferred server (matching name, audio type, and season)
        if (preferredServerName) {
            serverIdx = servers.findIndex((s: any) => 
                s.server_name === preferredServerName && 
                (mediaType !== 'tv' || !s.season || Number(s.season) === targetSeasonNum) &&
                (!preferredAudioType || s.audio_type === preferredAudioType)
            );
            if (serverIdx >= 0) console.log(`[Player] Selected preferred server: ${servers[serverIdx].server_name} (${servers[serverIdx].audio_type})`);
        }

        // 2. Fallback: match by name and season only (if audio type mismatch)
        if (serverIdx < 0 && preferredServerName) {
            serverIdx = servers.findIndex((s: any) => 
                s.server_name === preferredServerName && 
                (mediaType !== 'tv' || !s.season || Number(s.season) === targetSeasonNum)
            );
        }

        // 3. Fallback: pick any server in the current season
        if (serverIdx < 0) {
            serverIdx = servers.findIndex((s: any) => 
                mediaType !== 'tv' || !s.season || Number(s.season) === targetSeasonNum
            );
            if (serverIdx >= 0) console.log(`[Player] Selected first available season server: ${servers[serverIdx].server_name}`);
        }

        // 3. Final fallback
        if (serverIdx < 0) {
            serverIdx = Math.min(activeServerIdx, servers.length - 1);
            console.log(`[Player] Fallback to activeServerIdx: ${serverIdx}`);
        }

        const server = servers[serverIdx];
        if (!server?.server_data) return;
        const localEpNum = currentSeason ? (activeEpisodeIdx - currentSeason.start + 1) : (activeEpisodeIdx + 1);
        
        const extractNum = (name: string) => { 
            if (!name) return null;
            // Match "Tập X", "Ep X", "Episode X" or just a number if it's the only one
            const m = name.match(/(?:Tập|Episode|Ep|E)\s*(\d+)/i) || name.match(/(\d+)/);
            return m ? parseInt(m[1]) : null; 
        };

        console.log(`[Player] Selected Server: ${server.server_name} (S${server.season}), Local Ep: ${localEpNum}`);
        
        let ep = (server.server_data || []).find((item: any) => {
            const itemSeason = item.season || server.season;
            // Strict season matching for TV
            const isMatchSeason = mediaType !== 'tv' || Number(itemSeason) === targetSeasonNum;
            if (!isMatchSeason) return false;

            const num = extractNum(item.name);
            return num !== null && num === localEpNum;
        });

        // Fallback for movies or if season matching is too strict
        if (!ep && mediaType !== 'tv') {
            ep = server.server_data.find((item: any) => extractNum(item.name) === localEpNum);
        }
        
        // DANGEROUS: Remove the index-based fallback for TV shows to prevent picking wrong season links
        // if (!ep) ep = server.server_data[activeEpisodeIdx];

        if (ep) {
            console.log(`[Player] Match Found: ${ep.name} -> ${ep.m3u8 || ep.embed}`);
            const link = new StreamLink(ep);
            const targetUrl = activeType === 'HLS' ? link.hlsUrl : link.embedUrl;
            const finalUrl = targetUrl || link.bestUrl;
            
            if (finalUrl && finalUrl !== activeEmbed) {
                console.log(`[Player] S${currentSeason?.season_number ?? '?'}E${localEpNum} → ${finalUrl}`);
                
                // Print the full list of episodes for the current season in this server
                const seasonEps = (server.server_data || []).filter((item: any) => {
                    const itemSeason = item.season || server.season;
                    return mediaType !== 'tv' || !itemSeason || Number(itemSeason) === currentSeason?.season_number;
                });
                
                if (seasonEps.length > 0) {
                    console.log(`[Season Links] Season ${currentSeason?.season_number ?? '?'}:`);
                    console.table(seasonEps.map((e: any) => ({
                        Episode: e.name,
                        M3U8: e.m3u8 || 'N/A',
                        Embed: e.embed || 'N/A'
                    })));
                }

                setActiveEmbed(finalUrl);
            }
        }
        
        setStreamingLinks(servers);
        if (serverIdx !== activeServerIdx) setActiveServerIdx(serverIdx);
    }
  }, [streamableSources, userSettings, activeType, activeProvider, activeServerIdx, activeEpisodeIdx, seasonBoundaries, setActiveType, setActiveProvider, setStreamingLinks, setActiveServerIdx, setActiveEmbed, activeEmbed, isInitialized]);

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
