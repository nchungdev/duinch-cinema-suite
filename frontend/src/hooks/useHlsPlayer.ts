import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { useMovieDetail } from '../components/detail/MovieDetailContext';

export const useHlsPlayer = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
  const { 
    activeEmbed, activeType, streamingLinks, activeEpisodeIdx,
    setActiveEpisodeIdx, setActiveEmbed, activeServerIdx,
    setIsPlayerReady, setPlayerError, seasonBoundaries, slug,
    mediaType
  } = useMovieDetail();
  
  const hlsRef = React.useRef<Hls | null>(null);

  const attemptAutoplay = (video: HTMLVideoElement) => {
    const maybePromise = video.play();
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch((err: unknown) => {
        console.warn('[Player] Autoplay was blocked or failed:', err);
      });
    }
  };

  // Sync Player with active stream
  React.useEffect(() => {
    const server = streamingLinks?.[activeServerIdx];
    if (!server?.server_data) return;

    // Use robust matching logic: Find by Relative Episode Number in current Season
    let ep = null;
    
    // Find which season contains this global index
    const currentSeason = seasonBoundaries.find(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end);
    const localEpNum = currentSeason ? (activeEpisodeIdx - currentSeason.start + 1) : (activeEpisodeIdx + 1);
    
    const extractNum = (name: string) => { 
        const m = name?.match(/\d+/); 
        return m ? parseInt(m[0]) : null; 
    };
    
    // Try to find the episode that matches the local number
    ep = server.server_data.find((item: any) => extractNum(item.name) === localEpNum);
    
    if (!ep) {
        const globalEpNum = activeEpisodeIdx + 1;
        ep = server.server_data.find((item: any) => extractNum(item.name) === globalEpNum);
    }
    
    if (!ep) ep = server.server_data[activeEpisodeIdx];

    if (ep) {
        // Broad link detection
        const hlsLink = ep.m3u8 || ep.link_m3u8 || ep.link_hls || (ep.url?.includes('.m3u8') ? ep.url : null);
        const embedLink = ep.embed || ep.link_embed || ep.link || (ep.url?.includes('embed') ? ep.url : null);
        const fallback = ep.url || ep.link || hlsLink || embedLink;

        const targetUrl = activeType === 'HLS' ? hlsLink : embedLink;
        const finalUrl = targetUrl || fallback;
        
        if (finalUrl && finalUrl !== activeEmbed) {
            setActiveEmbed(finalUrl);
        }
    }
  }, [activeServerIdx, activeEpisodeIdx, activeType, streamingLinks, setActiveEmbed, seasonBoundaries]);

  // HLS Instance Management
  React.useEffect(() => {
    const video = videoRef.current;
    
    // Strict Cleanup: If not in HLS mode, kill everything and return
    if (!video || !activeEmbed || activeType !== 'HLS') {
        if (hlsRef.current) {
            hlsRef.current.destroy();
            hlsRef.current = null;
        }
        return;
    }

    setIsPlayerReady(false);
    setPlayerError(null);

    const onCanPlay = () => {
        setIsPlayerReady(true);
        // Sync Time: Restore progress from local store using episode-specific key
        const progressKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}`;
        const commonKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}`;
        const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
        
        // First try provider-specific, then fallback to common
        const saved = progressStore[progressKey] || progressStore[commonKey];
        if (saved && saved.time > 0) {
            if (Math.abs(video.currentTime - saved.time) > 2) {
                console.log(`[Player] Resuming ${progressKey} at ${saved.time}s`);
                video.currentTime = saved.time;
            }
        }
    };
    const onError = (e: any) => {
        console.error('[Player] Error:', e);
        setPlayerError('Failed to play video. Source might be dead.');
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    if (Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls();
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        attemptAutoplay(video);
      });
      hls.loadSource(activeEmbed);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeEmbed;
      video.load();
      attemptAutoplay(video);
    }

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [activeEmbed, activeType, videoRef, setIsPlayerReady, setPlayerError]);

  return { hlsRef };
};
