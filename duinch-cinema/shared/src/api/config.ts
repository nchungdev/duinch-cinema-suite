import axios from 'axios';

export const api = axios.create({
  // Use env var or default to /api for Web
  baseURL: (typeof process !== 'undefined' && process.env?.API_URL) || 
           (typeof process !== 'undefined' && process.env?.VITE_API_URL) || 
           '/api',
});

// Device ID tracking
const getDeviceId = () => {
  if (typeof localStorage !== 'undefined') {
    let id = localStorage.getItem('omv_device_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 15);
      localStorage.setItem('omv_device_id', id);
    }
    return id;
  }
  // Fallback for Native (simplified for now, should use AsyncStorage)
  return 'native-device-id';
};

// Request Interceptor
api.interceptors.request.use((config) => {
  config.headers['X-Device-ID'] = getDeviceId();
  return config;
});

// Response Interceptor - Crucial for backward compatibility with standardized API
api.interceptors.response.use(
  (response) => {
    const { data } = response;
    // Handle standardized wrapper: { error_code, error_message, server_time, data }
    if (data && typeof data === 'object' && 'error_code' in data && 'data' in data) {
      if (data.error_code !== 0) {
        return Promise.reject(new Error(data.error_message || 'API Error'));
      }
      // Unwrap the actual payload
      return { ...response, data: data.data };
    }
    return response;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const getProxiedImageUrl = (url?: string) => {
  if (!url) return '';
  // Always proxy to handle relative TMDB paths and bypass CORS
  return `${api.defaults.baseURL}/proxy/image?url=${encodeURIComponent(url)}`;
};

export interface MediaLink {
  url?: string;
  name?: string;
  quality?: string;
  size?: number;
  source?: string;
  provider?: string;
  stream_type?: string;
  updated_at?: string;
  is_folder?: boolean;
}

export interface StreamingEpisode {
  name: string;
  m3u8?: string;
  embed?: string;
  server?: string;
  source?: string;
}

export interface StreamingServer {
  server: string;
  episodes: StreamingEpisode[];
}

export interface MediaItem {
  id: number;
  tmdb_id?: number;
  title: string;
  originTitle?: string;
  origin_name?: string;
  poster: string;
  thumb_url?: string;
  year: string | number;
  slug: string;
  media_type: 'movie' | 'tv';
  type?: 'movie' | 'tv';
  quality?: string;
  overview?: string;
  genres?: { name: string }[];
}
