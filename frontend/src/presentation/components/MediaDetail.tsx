import { useRef, useState, useLayoutEffect, useMemo } from 'react';
import { ChevronLeft, Loader2 } from 'lucide-react';
import { MarqueeText } from './MarqueeText';
import { MediaDetailProvider } from '../context/MediaDetailContext';
import { useMediaDetailViewModel } from '../view-models/MediaDetailViewModel';
import { MediaStreamer } from './detail/MediaStreamer';
import { SourceMenu } from './detail/SourceMenu';
import { TVGallery } from './detail/TVGallery';
import { MovieGallery } from './detail/MovieGallery';
import { MediaInfo } from './detail/MediaInfo';
import { DiscoveryPipeline } from './DiscoveryPipeline';
import type { TVShow } from '../../domain/models/Media';

const NowPlayingHeader = () => {
  const { state } = useMediaDetailViewModel();
  const { media, mediaType, activeEmbed, streamingLinks, activeServerIdx, activeEpisodeIdx } = state;

  const currentEp = streamingLinks?.[activeServerIdx]?.server_data?.[activeEpisodeIdx];
  const isLive = !!activeEmbed;

  const tvLabel = useMemo(() => {
    if (mediaType !== 'tv' || !media) return null;
    const tv = media as TVShow;
    const s = tv.getSeasonAt(activeEpisodeIdx);
    if (!s) return null;
    
    let start = 0;
    for (const item of tv.seasons) {
        if (item.season_number === s.season_number) break;
        start += item.episode_count;
    }
    const epNum = activeEpisodeIdx - start + 1;
    return `Mùa ${s.season_number} · Tập ${epNum}`;
  }, [media, mediaType, activeEpisodeIdx]);

  const displayName = tvLabel ?? currentEp?.name ?? media?.title ?? '—';

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

const DetailContent = () => {
  const { state, actions } = useMediaDetailViewModel();
  const { loading, media, mediaType, slug, initialSeason, initialEpisode } = state;
  const { onBack, handleStreamingReady } = actions;

  const playerRef = useRef<HTMLDivElement>(null);
  const [playerHeight, setPlayerHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = playerRef.current;
    if (!el) return;
    const updateHeight = () => {
      const height = el.getBoundingClientRect().height;
      if (height > 0) setPlayerHeight(Math.round(height));
    };
    const ro = new ResizeObserver(updateHeight);
    ro.observe(el);
    updateHeight();
    return () => ro.disconnect();
  }, [loading, media]);

  if (loading && !media) {
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
          <button onClick={onBack} className="group flex items-center gap-2 mb-6 px-3 py-1.5 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 rounded-xl transition-all duration-200">
            <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 group-hover:text-white">Return to Discovery</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            <div className="lg:col-span-8 space-y-6">
              <MediaStreamer ref={playerRef} />
              <MediaInfo />
              <DiscoveryPipeline
                key={slug}
                tmdbId={Number(media?.id || 0)}
                title={media?.title || ''}
                localizeTitle={media?.originTitle}
                year={media?.year}
                mediaType={mediaType}
                initialSeason={mediaType === 'tv' ? initialSeason : undefined}
                initialEpisode={mediaType === 'tv' ? initialEpisode : undefined}
                onStreamingReady={handleStreamingReady}
              />
            </div>

            <div className="lg:col-span-4 sticky top-24 self-start min-h-0" style={playerHeight ? { height: playerHeight, minHeight: playerHeight, maxHeight: playerHeight } : undefined}>
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

export function MediaDetail(props: any) {
  return (
    <MediaDetailProvider initialValues={props}>
      <DetailContent />
    </MediaDetailProvider>
  );
}
