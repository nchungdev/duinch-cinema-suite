import React from 'react';
import { Clock, Calendar, Globe, Star } from 'lucide-react';
import { useMovieDetail } from './MovieDetailContext';
import { getProxiedImageUrl } from '../../api/config';

export const MediaInfo = () => {
    const { media, localExists } = useMovieDetail();
    if (!media) return null;

    const posterUrl = getProxiedImageUrl(media.poster);

    return (
        <div className="flex gap-6 items-start">
            {/* Poster */}
            <div className="hidden sm:block w-36 flex-shrink-0 aspect-[2/3] rounded-2xl overflow-hidden border border-white/10 shadow-xl">
                <img src={posterUrl} className="w-full h-full object-cover" alt={media.title} />
            </div>

            {/* Info */}
            <div className="flex-1 space-y-4">
                {/* Title */}
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white leading-tight">{media.title}</h1>
                    {media.originTitle && media.originTitle !== media.title && (
                        <p className="text-gray-500 text-sm font-medium mt-1">{media.originTitle}</p>
                    )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap items-center gap-3 text-gray-400">
                    {localExists && (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded-md">
                            <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
                            <span className="text-[8px] font-black text-green-400 uppercase tracking-widest">Local Asset</span>
                        </div>
                    )}
                    <span className="px-2 py-0.5 bg-blue-600/20 border border-blue-500/30 rounded-md text-[8px] font-black text-blue-400 uppercase tracking-widest">
                        {media.type === 'tv' ? 'Series' : 'Feature Film'}
                    </span>
                    <div className="flex items-center gap-1.5">
                        <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500/20" />
                        <span className="text-xs font-bold text-white tracking-widest">{media.quality || 'HD'}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-medium">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{media.year}</span>
                    </div>
                </div>

                {/* Description */}
                {media.overview && (
                    <p className="text-gray-400 text-sm leading-relaxed font-medium">
                        {media.overview}
                    </p>
                )}

                {/* Genre tags */}
                {media.genres && media.genres.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                        {media.genres.map((c, i) => (
                            <span
                                key={i}
                                className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-gray-400 hover:text-white hover:bg-white/10 transition-all cursor-default uppercase tracking-widest"
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
