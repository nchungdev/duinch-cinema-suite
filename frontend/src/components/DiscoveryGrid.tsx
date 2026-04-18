import { useEffect, useState, useRef, useCallback } from 'react';
import { api, getProxiedImageUrl } from '../api/config';
import { PlayCircle, Loader2 } from 'lucide-react';
import { MediaRepository } from '../repositories/MediaRepository';

interface DiscoveryItem {
  title: string;
  origin_name: string;
  slug: string;
  poster: string;
  year: number | string;
  media_type: 'movie' | 'tv';
}

interface DiscoveryResponse {
  results: DiscoveryItem[];
  pagination: any;
}

interface Props {
  category?: string;
  mediaType?: 'all' | 'movie' | 'tv';
  staticItems?: DiscoveryItem[];
  onMovieClick: (slug: string, mediaType: string) => void;
}

export function DiscoveryGrid({ category, mediaType = 'all', staticItems, onMovieClick }: Props) {
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageNum, setPageNum] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const isFetching = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchItems = useCallback(async (page: number, isInitial: boolean = false) => {
    if (staticItems || !category || (isFetching.current && isInitial)) return;
    
    if (isInitial && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    isFetching.current = true;
    setLoading(true);
    
    try {
      let newItems = [];
      if (category === 'phim-le') {
        const { data } = await api.get(`/movies?category=popular&page=${page}`, { signal: abortControllerRef.current.signal });
        newItems = data.results || [];
      } else if (category === 'phim-bo') {
        const { data } = await api.get(`/tvs?category=popular&page=${page}`, { signal: abortControllerRef.current.signal });
        newItems = data.results || [];
      } else {
        newItems = await MediaRepository.getTrending(mediaType, page);
      }
      
      setItems(prev => isInitial ? newItems : [...prev, ...newItems]);
      
      if (newItems.length < 5) setHasMore(false);
      else setHasMore(true);

    } catch (err: any) {
      if (err.name === 'CanceledError' || err.name === 'AbortError') return;
      console.error('Discovery fetch failed:', err);
    } finally {
      setLoading(false);
      isFetching.current = false;
    }
  }, [category, mediaType, staticItems]);

  useEffect(() => {
    if (staticItems) {
      setItems(staticItems);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setItems([]);
    setPageNum(1);
    setHasMore(true);
    fetchItems(1, true);
  }, [category, staticItems, fetchItems]);

  const observer = useRef<IntersectionObserver | null>(null);
  const lastElementRef = useCallback((node: HTMLDivElement) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        setPageNum(prev => prev + 1);
      }
    });
    if (node) observer.current.observe(node);
  }, [loading, hasMore]);

  useEffect(() => {
    if (pageNum > 1) fetchItems(pageNum, false);
  }, [pageNum, fetchItems]);

  return (
    <div className="space-y-12 pb-20">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-7 gap-x-6 gap-y-10 animate-cinema-fade">
        {items.map((item, idx) => (
          <div 
            key={`${item.slug}-${idx}`}
            ref={idx === items.length - 1 ? lastElementRef : null}
            onClick={() => onMovieClick(item.slug, item.media_type)}
            className="group relative cursor-pointer"
          >
            <div className="aspect-cinema relative rounded-[2rem] overflow-hidden bg-white/5 shadow-2xl transition-all duration-700 group-hover:scale-105 group-hover:-translate-y-3 ring-1 ring-white/10 group-hover:ring-blue-500/50">
              {item.poster ? (
                <img 
                  src={getProxiedImageUrl(item.poster)} 
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110 opacity-90 group-hover:opacity-100"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center p-8 text-center text-[10px] font-black uppercase tracking-widest text-gray-600">
                  {item.title}
                </div>
              )}
              
              <div className="absolute inset-0 ring-1 ring-inset ring-white/10 group-hover:ring-white/20 transition-all pointer-events-none rounded-[2rem]" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              
              <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-4 group-hover:translate-y-0">
                <div className="w-14 h-14 rounded-full bg-blue-600/90 flex items-center justify-center backdrop-blur-md shadow-[0_0_40px_rgba(37,99,235,0.6)] border border-white/20">
                  <PlayCircle className="w-7 h-7 text-white fill-white/20" />
                </div>
              </div>

              <div className="absolute top-4 right-4 translate-x-1 group-hover:translate-x-0 transition-transform duration-500">
                <div className={`px-2.5 py-1 rounded-lg backdrop-blur-md text-[8px] font-black uppercase tracking-tighter shadow-lg border border-white/10 ${
                  item.media_type === 'tv' ? 'bg-purple-600/80 text-white' : 'bg-blue-600/80 text-white'
                }`}>
                  {item.media_type === 'tv' ? 'SERIES' : 'MOVIE'}
                </div>
              </div>

              <div className="absolute bottom-6 left-6 opacity-0 group-hover:opacity-100 transition-all duration-500 translate-y-2 group-hover:translate-y-0">
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest">{item.year}</span>
              </div>
            </div>

            <div className="mt-5 px-1 space-y-1.5 transition-all duration-500 group-hover:px-2">
              <h3 className="text-xs font-black line-clamp-1 group-hover:text-blue-400 transition-colors uppercase tracking-tight font-outfit leading-tight">
                {item.title}
              </h3>
              <p className="text-[9px] text-gray-500 font-bold truncate uppercase tracking-widest opacity-60">
                {item.origin_name}
              </p>
            </div>
          </div>
        ))}

        {loading && Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="space-y-4">
             <div className="aspect-cinema rounded-[2rem] bg-white/5 animate-pulse border border-white/5" />
             <div className="h-3 w-3/4 bg-white/5 rounded-full animate-pulse ml-1" />
             <div className="h-2 w-1/2 bg-white/5 rounded-full animate-pulse ml-1" />
          </div>
        ))}
      </div>

      {!loading && hasMore && items.length > 0 && (
        <div className="flex justify-center pt-20">
             <div className="flex flex-col items-center gap-4">
                 <Loader2 className="w-6 h-6 text-blue-600 animate-spin opacity-40" />
                 <span className="text-[9px] font-bold uppercase tracking-[0.5em] text-gray-700">Incepting Data...</span>
             </div>
        </div>
      )}

      {!hasMore && items.length > 0 && (
        <div className="flex justify-center pt-20">
             <span className="text-[9px] font-bold uppercase tracking-[0.4em] text-gray-800">End of Recorded Universe</span>
        </div>
      )}
    </div>
  );
}
