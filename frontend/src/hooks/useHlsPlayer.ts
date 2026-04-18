import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { useMovieDetail } from '../components/detail/MovieDetailContext';

export const useHlsPlayer = (videoRef: React.RefObject<HTMLVideoElement>) => {
  const { 
    activeEmbed, activeType, streamingLinks, activeEpisodeIdx,
    setActiveEpisodeIdx, setActiveEmbed, activeServerIdx,
    setIsPlayerReady, setPlayerError
  } = useMovieDetail();
  
  const hlsRef = useRef<Hls | null>(null);

  const attemptAutoplay = (video: HTMLVideoElement) => {
    const maybePromise = video.play();
    if (maybePromise && typeof maybePromise.catch === 'function') {
      maybePromise.catch((err: unknown) => {
        console.warn('[Player] Autoplay was blocked or failed:', err);
      });
    }
  };

  // Sync Player with active stream
  useEffect(() => {
    if (activeType === 'P2P' || activeType === 'DIRECT') return;

    const server = streamingLinks?.[activeServerIdx];
    if (!server?.server_data) return;

    // Use robust matching logic
    let ep = null;
    const currentEpNum = activeEpisodeIdx + 1; // Global 1-based episode number
    
    const extractNum = (name: string) => { 
        const m = name?.match(/\d+/); 
        return m ? parseInt(m[0]) : null; 
    };
    
    // Find the episode that matches currentEpNum
    ep = server.server_data.find((item: any) => extractNum(item.name) === currentEpNum);
    
    // Fallback only if no match found
    if (!ep) ep = server.server_data[activeEpisodeIdx];

    if (ep && (ep.m3u8 || ep.embed)) {
        setActiveEmbed(ep.m3u8 || ep.embed);
    }
  }, [activeType, activeServerIdx, activeEpisodeIdx, streamingLinks, setActiveEmbed]);

  // HLS Instance Management
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeEmbed) return;

    // Strict Embed detection: if it's an EMBED type or contains common embed patterns
    const isEmbedUrl = activeEmbed.includes('iframe') || 
                       activeEmbed.includes('player.') || 
                       activeEmbed.includes('/embed/') ||
                       activeType === 'EMBED';

    if (isEmbedUrl) return; // Exit: MediaStreamer will render an <iframe> instead

    setIsPlayerReady(false);
    setPlayerError(null);

    const onCanPlay = () => setIsPlayerReady(true);
    const onError = (e: any) => {
        console.error('[Player] Error:', e);
        setPlayerError('Failed to play video. Source might be dead.');
    };

    video.addEventListener('canplay', onCanPlay);
    video.addEventListener('error', onError);

    if (activeType === 'P2P' || activeType === 'DIRECT') {
      video.src = activeEmbed;
      video.load();
      attemptAutoplay(video);
    } else if (Hls.isSupported()) {
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
