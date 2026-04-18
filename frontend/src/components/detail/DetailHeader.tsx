import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useMovieDetail } from './MovieDetailContext';
import { getProxiedImageUrl } from '../../api/config';

export const DetailHeader = () => {
    const { media, onBack } = useMovieDetail();
    if (!media) return null;

    const posterUrl = getProxiedImageUrl(media.poster);
    const bgUrl = getProxiedImageUrl(media.backdrop || media.poster);

    return (
        <div className="relative h-[45vh] min-h-[400px] w-full overflow-hidden">
            {/* Ambient Background */}
            <div 
                className="absolute inset-0 bg-cover bg-center scale-110 blur-2xl opacity-30 transform-gpu"
                style={{ backgroundImage: `url(${bgUrl})` }}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0c]/40 via-[#0a0a0c]/80 to-[#0a0a0c]" />
            
            {/* Navigation */}
            <div className="absolute top-8 left-8 z-50">
                <button 
                onClick={onBack}
                className="group flex items-center gap-3 px-4 py-2 bg-white/5 hover:bg-white/10 backdrop-blur-xl border border-white/10 rounded-2xl transition-all duration-300"
                >
                <ChevronLeft className="w-4 h-4 text-gray-400 group-hover:text-white transition-colors" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-400 group-hover:text-white">Return to Discovery</span>
                </button>
            </div>

            {/* Content Layout — title only */}
            <div className="absolute inset-0 flex items-end px-12 pb-12">
                <div className="w-full max-w-7xl mx-auto animate-slide-up-delayed">
                    <h1 className="text-5xl font-black tracking-tight text-white leading-tight drop-shadow-2xl">
                        {metadata.title}
                    </h1>
                </div>
            </div>
        </div>
    );
};
