import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { useMovieDetail } from '../context/MovieDetailContext';

/**
 * Controller: PlaybackController
 * Chịu trách nhiệm điều khiển trình phát video (HLS hoặc Native).
 * Nhận URL sạch từ ViewModel và thực hiện việc buffer/play.
 */
export const usePlaybackController = (videoRef: React.RefObject<HTMLVideoElement | null>) => {
  const { 
    activeEmbed, activeType, setIsPlayerReady, setPlayerError, 
    slug, mediaType, activeEpisodeIdx, activeProvider 
  } = useMovieDetail();
  
  const hlsRef = useRef<Hls | null>(null);

  const attemptAutoplay = (video: HTMLVideoElement) => {
    const maybePromise = video.play();
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch((err: unknown) => {
        console.warn('[PlaybackController] Autoplay blocked:', err);
      });
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    
    // Strict Cleanup: Only run if we are in HLS mode and have an URL
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
        
        // Progress Sync Logic
        const progressKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}_${activeProvider}`;
        const commonKey = `${slug}_${mediaType === 'tv' ? activeEpisodeIdx : 'movie'}`;
        const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
        const saved = progressStore[progressKey] || progressStore[commonKey];

        if (saved && saved.time > 0) {
            if (Math.abs(video.currentTime - saved.time) > 2) {
                console.log(`[PlaybackController] Resuming at ${saved.time}s`);
                video.currentTime = saved.time;
            }
        }
    };

    const onError = (e: any) => {
        console.error('[PlaybackController] Error:', e);
        setPlayerError('Failed to play video. Source might be dead.');
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    // Initialize HLS or Native Player
    if (Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls();
      hls.on(Hls.Events.MANIFEST_PARSED, () => attemptAutoplay(video));
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
  }, [activeEmbed, activeType, videoRef, setIsPlayerReady, setPlayerError, slug, mediaType, activeEpisodeIdx, activeProvider]);

  return { hlsRef };
};
