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

  // Sync Player with active stream
  useEffect(() => {
    if (activeType === 'P2P' || activeType === 'DIRECT') return;

    const server = streamingLinks?.[activeServerIdx];
    const ep = server?.server_data?.[activeEpisodeIdx];
    if (ep && (ep.m3u8 || ep.embed)) {
        setActiveEmbed(ep.m3u8 || ep.embed);
    }
  }, [activeType, activeServerIdx, activeEpisodeIdx, streamingLinks]);

  // HLS Instance Management
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeEmbed || activeEmbed.includes('iframe')) return;

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
    } else if (Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy();
      const hls = new Hls();
      hls.loadSource(activeEmbed);
      hls.attachMedia(video);
      hlsRef.current = hls;
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeEmbed;
    }

    return () => {
      video.removeEventListener('canplay', onCanPlay);
      video.removeEventListener('error', onError);
      if (hlsRef.current) hlsRef.current.destroy();
    };
  }, [activeEmbed, activeType, videoRef, setIsPlayerReady, setPlayerError]);

  return { hlsRef };
};
