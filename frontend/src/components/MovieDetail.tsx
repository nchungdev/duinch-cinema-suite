import React, { useRef, useState, useLayoutEffect } from 'react';
import { ChevronLeft, Radio, Zap, Activity, Disc3 } from 'lucide-react';
import { MarqueeText } from './MarqueeText';
import { useMovieDetail, MovieDetailProvider } from './detail/MovieDetailContext';
import { useMovieDetailData } from '../hooks/useMovieDetailData';
import { useStreamRegistry } from '../hooks/useStreamRegistry';
import { useStreamNavigation } from '../hooks/useStreamNavigation';
import { MediaStreamer } from './detail/MediaStreamer';
import { SourceMenu } from './detail/SourceMenu';
import { TVGallery } from './detail/TVGallery';
import { MovieGallery } from './detail/MovieGallery';
import { MediaInfo } from './detail/MediaInfo';
import { DiscoveryPipeline } from './DiscoveryPipeline';
import { Loader2 } from 'lucide-react';

const NowPlayingHeader = () => {
  const { metadata, mediaType, activeEmbed, activeType, activeProvider, streamingLinks, activeServerIdx, activeEpisodeIdx } = useMovieDetail();

  const currentEp = streamingLinks?.[activeServerIdx]?.server_data?.[activeEpisodeIdx];
  const isLive = !!activeEmbed;

  // For TV: derive season/episode from activeEpisodeIdx using tmdb_seasons
  const tvLabel = (() => {
    if (mediaType !== 'tv' || !metadata?.tmdb_seasons) return null;
    let offset = 0;
    for (const s of metadata.tmdb_seasons) {
      if (activeEpisodeIdx < offset + s.episode_count) {
        const ep = activeEpisodeIdx - offset + 1;
        return `Mùa ${s.season_number} · Tập ${ep}`;
      }
      offset += s.episode_count;
    }
    return `Tập ${activeEpisodeIdx + 1}`;
  })();

  const displayName = tvLabel ?? currentEp?.name ?? metadata?.title ?? '—';

  const typeIcon =
    activeType === 'P2P'    ? <Activity className="w-3 h-3" /> :
    activeType === 'DIRECT' ? <Disc3     className="w-3 h-3" /> :
    activeType === 'EMBED'  ? <Radio     className="w-3 h-3" /> :
                              <Zap       className="w-3 h-3" />;

  const typeColor =
    activeType === 'P2P'    ? 'text-green-400'  :
    activeType === 'DIRECT' ? 'text-red-400'    :
    activeType === 'EMBED'  ? 'text-purple-400' :
                              'text-blue-400';

  return (
    <div className="shrink-0 border-b border-white/5">
      {isLive ? (
        <div className="px-4 py-3 flex items-center gap-3">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_6px_#22c55e] shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-[7px] font-black uppercase tracking-[0.3em] text-green-400 block mb-0.5">Now Playing</span>
            <MarqueeText
              text={displayName}
              className="text-[13px] font-black text-white uppercase tracking-wide leading-tight"
            />
          </div>
          <SourceMenu />
        </div>
      ) : (
        <div className="p-4 flex items-center justify-between">
          <div>
            <span className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-500/80">Stream Control</span>
            <p className="text-[7px] text-gray-600 uppercase tracking-widest mt-1">Select Transmission Mode</p>
          </div>
          <SourceMenu />
        </div>
      )}
    </div>
  );
};

interface MovieDetailProps {
  slug: string;
  mediaType: string;
  category: string;
  initialSeason?: number;
  initialEpisode?: number;
  onBack: () => void;
}

const DetailContent = () => {
  const {
    loading, metadata, mediaType, onBack, initialSeason, initialEpisode
  } = useMovieDetail();

  useMovieDetailData();
  const { handleStreamingReady } = useStreamRegistry();
  useStreamNavigation();

  const playerRef = useRef<HTMLDivElement>(null);
  const [playerHeight, setPlayerHeight] = useState<number | null>(null);

  // Track the real MediaStreamer shell height and clamp the right column to it.
  useLayoutEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    
    const updateHeight = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) {
        setPlayerHeight(Math.round(height));
      }
    };

    const rafId = requestAnimationFrame(updateHeight);
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    updateHeight();
    
    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
    };
  }, [loading, metadata]);

  if (loading && !metadata) {
    return (
      <div className="fixed inset-0 bg-[#0a0a0c] flex items-center justify-center z-[100]">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="absolute inset-0 bg-blue-500/20 blur-3xl animate-pulse" />
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin relative z-10" />
          </div>
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500 animate-pulse">Initializing Data Stream</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0c] text-white overflow-hidden flex flex-col z-40 animate-in fade-in duration-700">
      <div className="absolute inset-0 overflow-y-auto no-scrollbar">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-24 pb-20">

          {/* Back button */}
          <button
            onClick={onBack}
            className="group flex items-center gap-2 mb-6 px-3 py-1.5 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl transition-all duration-200"
          >
            <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 group-hover:text-white">Return to Discovery</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

            {/* Left Column: Player, Info & Discovery */}
            <div className="lg:col-span-8 space-y-6">
              <MediaStreamer ref={playerRef} />
              <MediaInfo />
              <DiscoveryPipeline
                key={slug}
                tmdbId={metadata?.tmdb_id || 0}
                title={metadata?.title || ''}
                localizeTitle={metadata?.origin_name}
                year={metadata?.year}
                mediaType={mediaType}
                initialSeason={mediaType === 'tv' ? initialSeason : undefined}
                initialEpisode={mediaType === 'tv' ? initialEpisode : undefined}
                onStreamingReady={handleStreamingReady}
              />
            </div>

            {/* Right Column: Stream Control — explicit height = player height */}
            <div
              className="lg:col-span-4 sticky top-24 self-start min-h-0"
              style={playerHeight ? { height: playerHeight, minHeight: playerHeight, maxHeight: playerHeight } : undefined}
            >
              <div className="bg-[#0c0c0e]/80 backdrop-blur-2xl border border-white/5 rounded-3xl shadow-3xl flex flex-col h-full min-h-0 overflow-hidden">
                <NowPlayingHeader />
                <div className="flex-1 min-h-0 overflow-hidden rounded-b-3xl">
                  {mediaType === 'tv' ? <TVGallery /> : <MovieGallery />}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export function MovieDetail(props: MovieDetailProps) {
  return (
    <MovieDetailProvider initialValues={props}>
      <DetailContent />
    </MovieDetailProvider>
  );
}
