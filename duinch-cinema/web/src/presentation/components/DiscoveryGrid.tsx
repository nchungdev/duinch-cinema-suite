import { useEffect, useState, useRef, useCallback } from 'react';
import { api, getProxiedImageUrl } from '@shared/api/config';
import { PlayCircle, Loader2, Image as ImageIcon } from 'lucide-react';
import { MediaRepository } from '@shared/infrastructure/repositories/MediaRepository';

interface DiscoveryItem {
  id: number;
  tmdb_id: number;
  slug: string;
  title: string;
  origin_name: string;
  poster: string;
  year: string;
  media_type: 'movie' | 'tv';
}

export function DiscoveryGrid({ 
  category, 
  mediaType, 
  onItemClick,
  searchQuery
}: { 
  category: string; 
  mediaType: string; 
  onItemClick: (item: DiscoveryItem) => void;
  searchQuery?: string;
}) {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const pageRef      = useRef(1);
  const loadingRef   = useRef(false);
  const hasMoreRef   = useRef(true);
  const abortRef     = useRef<AbortController | null>(null);
  const loaderRef    = useRef<HTMLDivElement>(null);
  
  // Track requested pages to avoid duplicates
  const requestedPagesRef = useRef<Set<number>>(new Set());

  // Mutable params — không tạo closure mới khi thay đổi
  const paramsRef    = useRef({ category, mediaType, searchQuery });
  paramsRef.current  = { category, mediaType, searchQuery };

  const fetchPage = useCallback(async (pageNum: number, replace: boolean) => {
    // Avoid redundant requests
    if (loadingRef.current) return;
    if (!replace && requestedPagesRef.current.has(pageNum)) return;
    
    loadingRef.current = true;
    setLoading(true);
    if (!replace) requestedPagesRef.current.add(pageNum);

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    const { category: cat, mediaType: mt, searchQuery: sq } = paramsRef.current;

    try {
      let newItems: any[] = [];

      if (cat === 'movies' || cat === 'series' || cat === 'popular' || cat === 'top_rated' || cat === 'releases') {
        const endpoint = (mt === 'tv' || cat === 'series') ? '/tvs' : '/movies';
        const tmdbCategory = cat === 'series' ? 'popular' : cat === 'movies' ? 'popular' : cat;
        const res = await api.get(`${endpoint}?category=${tmdbCategory}&page=${pageNum}`, { signal });
        newItems = res.data?.results || [];
      } else if (cat === 'animation') {
        const res = await api.get(`/tvs?category=animation&page=${pageNum}`, { signal });
        newItems = res.data?.results || [];
      } else if (cat === 'search' && sq) {
        const res = await api.get(`/search?q=${encodeURIComponent(sq)}&media_type=${mt}&page=${pageNum}`, { signal });
        newItems = res.data?.results || [];
      } else {
        // Default to trending
        newItems = await MediaRepository.getTrending(mt, pageNum);
      }

      const normalized = newItems.map((item: any) => ({
        ...item,
        tmdb_id: item.tmdb_id || item.id,
        slug: item.slug || item.tmdb_id?.toString() || item.id?.toString(),
        media_type: item.media_type || (mt === 'tv' || cat === 'series' || cat === 'animation' ? 'tv' : 'movie')
      }));

      const more = newItems.length >= 8;
      setItems(prev => replace ? normalized : [...prev, ...normalized]);
      setHasMore(more);
      hasMoreRef.current = more;
      pageRef.current = pageNum;

    } catch (err: any) {
      if (err.name !== 'CanceledError' && err.name !== 'AbortError')
        console.error('Discovery fetch failed:', err);
      // Remove from set if failed so it can be retried
      if (!replace) requestedPagesRef.current.delete(pageNum);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []); // stable — đọc params qua ref

  // Reset + initial fetch khi params thay đổi
  useEffect(() => {
    pageRef.current    = 1;
    hasMoreRef.current = true;
    loadingRef.current = false;
    requestedPagesRef.current.clear();
    setItems([]);
    setHasMore(true);
    fetchPage(1, true);
  }, [category, mediaType, searchQuery]); // fetchPage stable nên không cần

  // Infinite scroll — observer stable, không re-attach khi hasMore thay đổi
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && hasMoreRef.current && !loadingRef.current) {
        fetchPage(pageRef.current + 1, false);
      }
    }, { threshold: 0.1 });

    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => observer.disconnect();
  }, []); // mount/unmount only — đọc state qua ref

  return (
    <div className="space-y-12">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-8">
        {items.map((item, idx) => (
          <div
            key={`${item.slug}-${idx}`}
            onClick={() => onItemClick(item)}
            className="group relative cursor-pointer"
          >
            <div className="aspect-[2/3] rounded-2xl overflow-hidden bg-white/5 border border-white/5 transition-all duration-500 group-hover:scale-[1.03] group-hover:border-blue-500/30 group-hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.5)]">
              {item.poster ? (
                <img
                  src={getProxiedImageUrl(item.poster)}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-700 gap-2">
                   <ImageIcon className="w-10 h-10" />
                   <span className="text-[8px] font-black uppercase">No Image</span>
                </div>
              )}
              
              <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 scale-75 group-hover:scale-100">
                 <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center shadow-2xl shadow-blue-600/50">
                    <PlayCircle className="w-8 h-8 text-white fill-white/10" />
                 </div>
              </div>
              
              <div className="absolute top-3 right-3 px-2 py-1 bg-black/60 backdrop-blur-md rounded-lg border border-white/10">
                <span className="text-[8px] font-black uppercase tracking-widest text-white/80">
                  {item.year || 'N/A'}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-1 px-1">
              <h3 className="text-xs font-black text-gray-200 group-hover:text-white transition-colors line-clamp-1 uppercase tracking-wider">
                {item.title}
              </h3>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest line-clamp-1">
                {item.origin_name || item.title}
              </p>
            </div>
          </div>
        ))}
      </div>

      <div ref={loaderRef} className="flex flex-col items-center justify-center py-12 gap-4">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
             <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
             <span className="text-[9px] font-black uppercase tracking-[0.4em] text-gray-600 animate-pulse">Scanning Galaxy</span>
          </div>
        ) : !hasMore && items.length > 0 && (
          <div className="flex justify-center pt-20">
             <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-800">Edge of Known Space</span>
          </div>
        )}
      </div>
    </div>
  );
}
