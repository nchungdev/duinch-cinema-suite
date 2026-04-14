import { useState, useEffect, useRef, useCallback } from 'react';
import { MovieCard } from './MovieCard';
import { api } from '../api/config';
import type { MediaItem, DiscoveryResponse } from '../api/config';
import { Satellite, Loader2 } from 'lucide-react';

interface DiscoveryGridProps {
  category: string;
  onMovieClick: (slug: string) => void;
}

export const DiscoveryGrid = ({ category, onMovieClick }: DiscoveryGridProps) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const observer = useRef<IntersectionObserver | null>(null);

  const loadMore = useCallback(async (pageNum: number, isInitial = false) => {
    if (loading || (!hasMore && !isInitial)) return;
    setLoading(true);

    try {
      // Batch fetch logic: Fetch 3 pages for initial load to fill the high-density grid
      const pagesToFetch = isInitial ? [1, 2, 3] : [pageNum];
      const results = await Promise.all(
        pagesToFetch.map(p => api.get<DiscoveryResponse>(`/discovery?category=${category}&page=${p}`))
      );

      const newItems = results.flatMap(res => res.data.items);
      const lastRes = results[results.length - 1].data;

      setItems(prev => (isInitial ? newItems : [...prev, ...newItems]));
      setHasMore(lastRes.pagination.currentPage < lastRes.pagination.totalPages);
      setPage(isInitial ? 4 : pageNum + 1);
    } catch (err) {
      console.error('Discovery fetch failed:', err);
    } finally {
      setLoading(false);
    }
  }, [category, loading, hasMore]);

  // Handle category changes
  useEffect(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    loadMore(1, true);
  }, [category]);

  // Intersection Observer for infinite scroll
  const lastElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading) return;
    if (observer.current) observer.current.disconnect();

    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore(page);
      }
    });

    if (node) observer.current.observe(node);
  }, [loading, hasMore, page, loadMore]);

  return (
    <div className="space-y-8">
      {items.length === 0 && loading ? (
        <div className="flex flex-col items-center justify-center py-40 animate-pulse">
          <Satellite className="w-12 h-12 text-primary animate-spin-slow mb-6" />
          <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-500">Syncing Cinematic Database...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 px-2">
          {items.map((item, idx) => (
            <MovieCard 
              key={`${item.slug}-${idx}`} 
              item={item} 
              onClick={onMovieClick} 
            />
          ))}
          
          {/* Infinite Scroll Sentinel */}
          <div ref={lastElementRef} className="col-span-full h-20 flex items-center justify-center">
            {loading && hasMore && <Loader2 className="w-6 h-6 text-primary animate-spin" />}
          </div>
        </div>
      )}
    </div>
  );
};
