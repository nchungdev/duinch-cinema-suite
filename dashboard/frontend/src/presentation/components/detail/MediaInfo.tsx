
import { Calendar, Star, Info } from 'lucide-react';
import { useMediaDetail } from '../../context/MediaDetailContext';
import { getProxiedImageUrl } from '../../../api/config';

export const MediaInfo = () => {
    const { media, localExists } = useMediaDetail();
    if (!media) return null;

    // Use backdrop (thumb_url) for a more compact sidebar header, fallback to poster
    const headerImgUrl = getProxiedImageUrl((media as any).thumb_url || media.poster);

    return (
        <div className="flex flex-col">
            {/* Cinematic Header (16:9 Aspect) */}
            <div className="w-full aspect-video rounded-t-[2rem] overflow-hidden relative bg-black/40">
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
                
                {/* Float Badge on Image */}
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

            {/* Info Container */}
            <div className="px-6 py-6 space-y-5">
                {/* Title Section */}
                <div className="space-y-1.5">
                    <h1 className="text-xl font-black tracking-tight text-white leading-tight uppercase italic underline decoration-blue-500/30 underline-offset-8 decoration-2">
                        {media.title}
                    </h1>
                    {media.originTitle && media.originTitle !== media.title && (
                        <p className="text-gray-500 text-[9px] font-bold uppercase tracking-[0.2em] truncate">
                            {media.originTitle}
                        </p>
                    )}
                </div>

                {/* Technical Meta */}
                <div className="flex items-center gap-4 py-3 border-y border-white/5">
                    <div className="flex items-center gap-1.5">
                        <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                        <span className="text-[10px] font-black text-white">{media.quality || 'HD'}</span>
                    </div>
                    <div className="w-px h-3 bg-white/10" />
                    <div className="flex items-center gap-1.5 text-gray-400">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[10px] font-bold">{media.year}</span>
                    </div>
                    <div className="w-px h-3 bg-white/10" />
                    <div className="flex items-center gap-1.5 text-blue-500">
                        <Info className="w-3 h-3" />
                        <span className="text-[8px] font-black uppercase tracking-widest">Active</span>
                    </div>
                </div>

                {/* Description - Now visible without scrolling */}
                {media.overview && (
                    <div className="space-y-2">
                        <p className="text-gray-400 text-[12px] leading-relaxed font-medium line-clamp-4 hover:line-clamp-none transition-all cursor-help italic border-l border-blue-500/20 pl-4">
                            {media.overview}
                        </p>
                    </div>
                )}

                {/* Classification */}
                {media.genres && media.genres.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                        {media.genres.map((c, i) => (
                            <span
                                key={i}
                                className="px-2 py-1 bg-white/5 border border-white/5 rounded-lg text-[8px] font-black text-gray-500 hover:text-white hover:bg-blue-600/20 hover:border-blue-500/30 transition-all cursor-default uppercase tracking-tighter"
                            >
                                {c.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
