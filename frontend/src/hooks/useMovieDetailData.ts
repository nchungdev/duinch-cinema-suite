import { useEffect } from 'react';
import { api } from '../api/config';
import type { MovieMetadata } from '../api/config';
import { useMovieDetail } from '../components/detail/MovieDetailContext';

export const useMovieDetailData = () => {
  const { 
    slug, mediaType, 
    setMetadata, setLoading, setLocalExists, setUserSettings 
  } = useMovieDetail();

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;
      setLoading(true);
      try {
        const endpoint = mediaType === 'tv' ? `/tv/${slug}` : `/movie/${slug}`;
        const res = await api.get(endpoint);
        setMetadata(res.data.metadata);
        setLocalExists(res.data.local.exists);
      } catch (err) {
        console.error(`Failed to fetch ${mediaType} details:`, err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [slug, mediaType]);

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
