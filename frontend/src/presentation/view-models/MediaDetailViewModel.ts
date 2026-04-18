import { useEffect, useCallback } from 'react';
import { api } from '../../api/config';
import { useMediaDetail } from '../context/MediaDetailContext';
import { GetMediaDetail } from '../../core/use-cases/GetMediaDetail';
import { SelectBestStream } from '../../core/use-cases/SelectBestStream';
import { StreamLink, type StreamType, type RawLinkData } from '../../domain/models/StreamLink';
import type { StreamingEpisode, StreamingServer } from '../../api/config';

/**
 * ViewModel: MediaDetailViewModel
 * Người đại diện (Presenter) duy nhất cho View chi tiết phim.
 * Gom tất cả logic dữ liệu, điều hướng và đăng ký luồng phát.
 */
export const useMediaDetailViewModel = () => {
  const context = useMediaDetail();
  
  const { 
    slug, mediaType, media, setMedia, 
    loading, setLoading, 
    setLocalExists,
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

  // 1. Logic: Tải dữ liệu Metadata
  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      setLoading(true);
      try {
        const useCase = new GetMediaDetail();
        const mediaInstance = await useCase.execute(mediaType, slug);
        setMedia(mediaInstance);
        
        // Fetch local status
        const endpoint = mediaType === 'tv' ? `/tv/${slug}` : `/movie/${slug}`;
        const res = await api.get(endpoint);
        setLocalExists(res.data.data.local?.exists || false);
      } catch (err) {
        console.error(`[ViewModel] Failed to fetch ${mediaType} details:`, err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, mediaType, setMedia, setLoading, setLocalExists]);

  // 2. Logic: Tải Cài đặt người dùng
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.get('/user/settings');
        setUserSettings(res.data);
      } catch (err) {
        console.warn('[ViewModel] Failed to load settings:', err);
        setUserSettings({ preferred_source: 'auto' });
      }
    };
    loadSettings();
  }, [setUserSettings]);

  // 3. Logic: Đăng ký luồng phát (Registry)
  const handleStreamingReady = useCallback((links: RawLinkData[], sourceId: string) => {
    setStreamableSources(prev => {
        const next = { ...prev };
        
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

  // 4. Logic: Điều hướng luồng phát (Navigation & Link Selection)
  useEffect(() => {
    const selector = new SelectBestStream();
    const result = selector.execute(
        streamableSources, 
        userSettings?.preferred_source || 'auto',
        activeType
    );

    if (result) {
        if (result.type !== activeType) setActiveType(result.type);
        if (result.provider !== activeProvider) setActiveProvider(result.provider);
        
        const server = streamableSources[result.type]?.[result.provider]?.[activeServerIdx];
        if (!server?.server_data) return;

        // Unified URL selection logic
        const currentSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
        const localEpNum = currentSeason ? (activeEpisodeIdx - currentSeason.start + 1) : (activeEpisodeIdx + 1);
        
        const extractNum = (name: string) => { 
            const m = name?.match(/\d+/); 
            return m ? parseInt(m[0]) : null; 
        };
        
        let ep = server.server_data.find((item: StreamingEpisode) => extractNum(item.name) === localEpNum);
        if (!ep) {
            const globalEpNum = activeEpisodeIdx + 1;
            ep = server.server_data.find((item: StreamingEpisode) => extractNum(item.name) === globalEpNum);
        }
        if (!ep) ep = server.server_data[activeEpisodeIdx];

        if (ep) {
            const link = new StreamLink(ep);
            const targetUrl = result.type === 'HLS' ? link.hlsUrl : link.embedUrl;
            const finalUrl = targetUrl || link.bestUrl;
            
            if (finalUrl && finalUrl !== activeEmbed) {
                setActiveEmbed(finalUrl);
            }
        }
        
        setStreamingLinks(streamableSources[result.type]?.[result.provider] || []);

        if (streamingLinks.length > 0 && activeServerIdx >= streamingLinks.length) {
            setActiveServerIdx(0);
        }
    }
  }, [streamableSources, userSettings, activeType, activeProvider, activeServerIdx, activeEpisodeIdx, seasonBoundaries, setActiveType, setActiveProvider, setStreamingLinks, setActiveServerIdx, setActiveEmbed, activeEmbed, streamingLinks.length]);

  // 5. Logic: Xử lý Resolvers (Fshare Login...)
  const handleFshareLogin = async (email: string, password: string) => {
    try {
        await api.post('/stream/fshare/login', { email, password });
        const res = await api.get('/user/settings');
        setUserSettings(res.data);
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
