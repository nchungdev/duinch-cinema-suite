import { Calendar, Star, Info } from 'lucide-react';
import { useMediaDetail } from '../../context/MediaDetailContext';
import { getProxiedImageUrl } from '../../../api/config';

export const MediaInfo = () => {
    const { media, localExists } = useMediaDetail();
    if (!media) return null;

    // Use backdrop (thumb_url) for a more compact sidebar header
    const headerImgUrl = getProxiedImageUrl((media as any).thumb_url || media.poster);

    return (
        <div className="flex flex-col overflow-hidden rounded-[2.5rem]">
            {/* Cinematic Header (Layered Backdrop) */}
            <div className="w-full aspect-video overflow-hidden relative bg-black/40">
                {headerImgUrl ? (
                    <>
                        {/* Blurred Background Layer */}
                        <img src={headerImgUrl} className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-40 scale-110" alt="" />
                        
                        {/* Full Image Layer (No Crop) */}
                        <img src={headerImgUrl} className="relative w-full h-full object-contain z-10" alt={media.title} />
                        
                        {/* Vignette Overlay */}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0e] via-transparent to-transparent z-20" />
                    </>
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="text-[8px] font-black uppercase text-gray-700 tracking-[0.3em]">No Visual</span>
                    </div>
                )}
                
                {/* Float Badges */}
                <div className="absolute bottom-4 left-6 flex gap-2 z-30">
                    <span className="px-2 py-0.5 bg-blue-600 border border-blue-400/50 rounded-lg text-[7px] font-black text-white uppercase tracking-widest shadow-xl">
                        {media.type === 'tv' ? 'Series' : 'Film'}
                    </span>
                    {localExists && (
                        <span className="px-2 py-0.5 bg-green-600 border border-green-400/50 rounded-lg text-[7px] font-black text-white uppercase tracking-widest shadow-xl">
                            Local
                        </span>
                    )}
                </div>
            </div>

            {/* Content Container */}
            <div className="px-8 py-8 space-y-6">
                {/* Title */}
                <div className="space-y-2">
                    <h1 className="text-2xl font-black tracking-tight text-white leading-tight uppercase italic underline decoration-blue-500/30 underline-offset-8 decoration-2">
                        {media.title}
                    </h1>
                    {media.originTitle && media.originTitle !== media.title && (
                        <p className="text-gray-500 text-[9px] font-bold uppercase tracking-[0.2em] truncate">
                            {media.originTitle}
                        </p>
                    )}
                </div>

                {/* Meta Strip */}
                <div className="flex items-center gap-4 py-4 border-y border-white/5">
                    <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                        <span className="text-[11px] font-black text-white">{media.quality || '4K'}</span>
                    </div>
                    <div className="w-px h-3.5 bg-white/10" />
                    <div className="flex items-center gap-1.5 text-gray-400">
                        <Calendar className="w-3.5 h-3.5" />
                        <span className="text-[11px] font-bold">{media.year}</span>
                    </div>
                    <div className="w-px h-3.5 bg-white/10" />
                    <div className="flex items-center gap-1.5 text-blue-500">
                        <Info className="w-3.5 h-3.5" />
                        <span className="text-[9px] font-black uppercase tracking-widest">Active</span>
                    </div>
                </div>

                {/* Overview */}
                {media.overview && (
                    <div className="space-y-3">
                        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-gray-600 block">System Log / Overview</span>
                        <p className="text-gray-400 text-[13px] leading-relaxed font-medium italic border-l-2 border-blue-500/20 pl-5 line-clamp-6 hover:line-clamp-none transition-all cursor-help">
                            {media.overview}
                        </p>
                    </div>
                )}

                {/* Classification */}
                {media.genres && media.genres.length > 0 && (
                    <div className="space-y-4 pt-2">
                        <span className="text-[8px] font-black uppercase tracking-[0.4em] text-gray-600 block">Classifications</span>
                        <div className="flex flex-wrap gap-2">
                            {media.genres.map((c, i) => (
                                <span
                                    key={i}
                                    className="px-3 py-1.5 bg-white/5 border border-white/5 rounded-xl text-[9px] font-black text-gray-500 hover:text-white hover:bg-blue-600/20 hover:border-blue-500/30 transition-all cursor-default uppercase tracking-tighter"
                                >
                                    {c.name}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
