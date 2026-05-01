import { ChevronLeft, Loader2 } from 'lucide-react';
import { MediaDetailProvider } from '../context/MediaDetailContext';
import { useMediaDetailViewModel } from '../view-models/MediaDetailViewModel';
import { MediaStreamer } from './detail/MediaStreamer';
import { TVGallery } from './detail/TVGallery';
import { MovieGallery } from './detail/MovieGallery';
import { MediaInfo } from './detail/MediaInfo';
import { DiscoveryPipeline } from './DiscoveryPipeline';

const DetailContent = () => {
  const { state, actions } = useMediaDetailViewModel();
  const { loading, media, mediaType, slug, initialSeason, initialEpisode, activeSeasonIdx, seasonBoundaries } = state;
  const { onBack, handleStreamingReady } = actions;
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

  const currentSeason = mediaType === 'tv' ? seasonBoundaries[activeSeasonIdx]?.season_number : undefined;

  // NEW: Calculate absolute initial episode for discovery
  const initialAbsoluteEp = mediaType === 'tv' && seasonBoundaries.length > 0 && initialSeason
    ? (seasonBoundaries.find(s => s.season_number === initialSeason)?.start || 0) + (initialEpisode || 1)
    : initialEpisode;

  return (
    <div className="fixed inset-0 bg-[#0a0a0c] text-white overflow-hidden flex flex-col z-40 animate-in fade-in duration-700">
      <div className="absolute inset-0 overflow-y-auto no-scrollbar">
        <div className="max-w-7xl mx-auto px-6 lg:px-12 pt-24 pb-20">
          {/* Back Button */}
          <button onClick={onBack} className="group flex items-center gap-2 mb-8 px-4 py-2 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95">
            <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 group-hover:text-white">Return to Discovery</span>
          </button>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* LEFT COLUMN: Player & Episodes & Discovery */}
            <div className="lg:col-span-8 space-y-8">
              {/* 1. Player */}
              <MediaStreamer />
              
              {/* 2. Episode Gallery (Horizontal Strip below player) */}
              <div className="bg-[#0c0c0e]/60 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] overflow-hidden shadow-3xl">
                {mediaType === 'tv' ? <TVGallery /> : <MovieGallery />}
              </div>

              {/* 3. Discovery Engine */}
              <div className="pt-4">
                <div className="flex items-center gap-4 mb-6">
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gray-600">Discovery Engine</span>
                    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
                <DiscoveryPipeline
                    key={slug}
                    tmdbId={Number(media?.id || 0)}
                    title={media?.title || ''}
                    localizeTitle={media?.originTitle}
                    year={media?.year}
                    mediaType={mediaType}
                    initialSeason={mediaType === 'tv' ? initialSeason : undefined}
                    initialEpisode={initialAbsoluteEp}
                    season={currentSeason}
                    onStreamingReady={handleStreamingReady}
                />
              </div>
            </div>

            {/* RIGHT COLUMN: Media Info */}
            <div className="lg:col-span-4 sticky top-24 self-start space-y-6">
              <div className="bg-[#0c0c0e]/80 backdrop-blur-2xl border border-white/5 rounded-[2.5rem] overflow-hidden shadow-3xl">
                 <MediaInfo />
              </div>
              
              <div className="px-8 py-4 bg-blue-600/5 border border-blue-500/10 rounded-3xl">
                 <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black uppercase tracking-widest text-blue-500/60">Node Status</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-green-500">Connected</span>
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
