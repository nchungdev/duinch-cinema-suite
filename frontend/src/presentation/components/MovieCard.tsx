import { motion } from 'framer-motion';
import type { MediaItem } from '../../api/config';

interface MovieCardProps {
  item: MediaItem;
  onClick: (slug: string, mediaType: string) => void;
}

export const MovieCard = ({ item, onClick }: MovieCardProps) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -5 }}
      onClick={() => onClick(item.slug, item.media_type)}
      className="relative aspect-[2/3] rounded-2xl overflow-hidden cursor-pointer group bg-white/5 border border-white/5 hover:border-blue-500/50 transition-all duration-500 shadow-2xl"
    >
      <img
        src={item.poster}
        alt={item.title}
        className="w-full h-full object-cover transform scale-[1.01] group-hover:scale-110 group-hover:blur-[2px] transition-all duration-700"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = 'https://placehold.co/300x450?text=No+Poster';
        }}
      />

      {/* Hover Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4 translate-y-4 group-hover:translate-y-0">
        <div className="space-y-1">
          <div className="font-black text-white uppercase italic leading-none tracking-tighter text-[10px] line-clamp-2">
            {item.title}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[7px] font-black text-blue-400 uppercase tracking-widest">{item.year}</span>
            <span className="w-1 h-1 bg-white/20 rounded-full"></span>
            <span className="text-[7px] font-black text-gray-400 uppercase tracking-widest">
              {item.media_type === 'tv' ? 'SERIES' : 'MOVIE'}
            </span>
          </div>
        </div>
      </div>

      {/* Static Tag (shows when not hovered) */}
      <div className="absolute top-2 right-2 opacity-100 group-hover:opacity-0 transition-opacity">
        <span className="text-[6px] font-black px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md text-gray-300 uppercase border border-white/10 tracking-widest">
          {item.year}
        </span>
      </div>
    </motion.div>
  );
};
