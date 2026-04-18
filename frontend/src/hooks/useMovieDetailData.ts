import { useEffect } from 'react';
import { api } from '../api/config';
import { useMovieDetail } from '../components/detail/MovieDetailContext';
import { GetMediaDetail } from '../core/use-cases/GetMediaDetail';

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
        const useCase = new GetMediaDetail();
        const mediaInstance = await useCase.execute(mediaType, slug);
        setMedia(mediaInstance);
        
        // Fetch local status (To be moved to a Use Case later)
        const endpoint = mediaType === 'tv' ? `/tv/${slug}` : `/movie/${slug}`;
        const res = await api.get(endpoint);
        setLocalExists(res.data.data.local?.exists || false);
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
