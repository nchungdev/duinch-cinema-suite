import { useEffect } from 'react';
import { api } from '../api/config';
import { useMovieDetail } from '../components/detail/MovieDetailContext';
import { MediaRepository } from '../infrastructure/repositories/MediaRepository';

export const useMovieDetailData = () => {
  const { 
    slug, mediaType, 
    setMedia, setLoading, setLocalExists, setUserSettings 
  } = useMovieDetail();

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      setLoading(true);
      try {
        const mediaInstance = await MediaRepository.getDetails(mediaType, slug);
        setMedia(mediaInstance);
        
        // Fetch local status separately (still simple for now)
        const endpoint = mediaType === 'tv' ? `/tv/${slug}` : `/movie/${slug}`;
        const res = await api.get(endpoint);
        setLocalExists(res.data.local?.exists || false);
      } catch (err) {
        console.error(`[Detail] Failed to fetch ${mediaType} details:`, err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, mediaType, setMedia, setLoading, setLocalExists]);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.get('/user/settings');
        setUserSettings(res.data);
      } catch (err) {
        console.warn('Failed to load settings:', err);
        setUserSettings({ preferred_source: 'auto' });
      }
    };
    loadSettings();
  }, []);
};
