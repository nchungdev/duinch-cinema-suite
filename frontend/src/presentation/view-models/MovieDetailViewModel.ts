import { useEffect, useCallback } from 'react';
import { api } from '../../api/config';
import { useMovieDetail } from '../context/MovieDetailContext';
import { GetMediaDetail } from '../../core/use-cases/GetMediaDetail';
import { SelectBestStream } from '../../core/use-cases/SelectBestStream';
import { StreamLink, type StreamType } from '../../domain/models/StreamLink';

/**
 * ViewModel: MovieDetailViewModel
 * Người đại diện (Presenter) duy nhất cho View chi tiết phim.
 * Gom tất cả logic dữ liệu, điều hướng và đăng ký luồng phát.
 */
export const useMovieDetailViewModel = () => {
  const { 
    slug, mediaType, media, setMedia, 
    loading, setLoading, 
    localExists, setLocalExists,
    userSettings, setUserSettings,
    streamableSources, setStreamableSources,
    activeType, setActiveType,
    activeProvider, setActiveProvider,
    activeServerIdx, setActiveServerIdx,
    activeEpisodeIdx, setActiveEpisodeIdx,
    activeSeasonIdx, setActiveSeasonIdx,
    streamingLinks, setStreamingLinks,
    activeEmbed, setActiveEmbed,
    isPlayerReady, setIsPlayerReady,
    playerError, setPlayerError,
    onBack, seasonBoundaries
  } = useMovieDetail();

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
  const handleStreamingReady = useCallback((links: any[], sourceId: string) => {
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
                
                let targetServer = next[type][platform].find((s: any) => s.server_name === serverKey);
                if (!targetServer) {
                    targetServer = { server_name: serverKey, server_data: [] };
                    next[type][platform].push(targetServer);
                }

                const epName = link.name;
                let existingEp = targetServer.server_data.find((e: any) => e.name === epName);

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

  // 4. Logic: Điều hướng luồng phát (Navigation)
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
        
        const links = streamableSources[result.type]?.[result.provider] || [];
        setStreamingLinks(links);

        if (links.length > 0 && activeServerIdx >= links.length) {
            setActiveServerIdx(0);
        }
    }
  }, [streamableSources, userSettings, activeType, activeProvider, activeServerIdx, setActiveType, setActiveProvider, setStreamingLinks, setActiveServerIdx]);

  // 5. Logic: Xử lý Resolvers (Fshare Login...)
  const handleFshareLogin = async (email: string, password: string) => {
    try {
        await api.post('/stream/fshare/login', { email, password });
        const res = await api.get('/user/settings');
        setUserSettings(res.data);
        return true;
    } catch (err) {
        return false;
    }
  };

  return {
    state: {
        slug,
        mediaType,
        media,
        loading,
        localExists,
        userSettings,
        streamableSources,
        activeType,
        activeProvider,
        activeServerIdx,
        activeEpisodeIdx,
        activeSeasonIdx,
        streamingLinks,
        activeEmbed,
        isPlayerReady,
        playerError,
        seasonBoundaries
    },
    actions: {
        setMedia,
        setLoading,
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
