import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Device ID tracking
const getDeviceId = () => {
  let id = localStorage.getItem('omv_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('omv_device_id', id);
  }
  return id;
};

api.interceptors.request.use((config) => {
  config.headers['X-Device-ID'] = getDeviceId();
  return config;
});

export const getProxiedImageUrl = (url?: string) => {
  if (!url) return '';
  if (url.startsWith('http')) {
    return `${api.defaults.baseURL}/proxy/image?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export interface MediaLink {
  url?: string;
  name?: string;
  quality?: string;
  size?: number;
  seeders?: number;
  leechers?: number;
  source?: string;
  is_folder?: boolean;
  updated_at?: string | number;
}

export interface StreamingEpisode {
  name: string;
  m3u8?: string;
  link_m3u8?: string;
  link_hls?: string;
  embed?: string;
  link_embed?: string;
  magnet?: string;
  url?: string;
  link?: string;
  source_type?: string;
  stream_type?: string;
  provider?: string;
  server?: string;
  season?: number | string;
  episode?: number | string;
  isTorrent?: boolean;
  scraper?: string;
}

export interface StreamingServer {
  server_name: string;
  server_data: StreamingEpisode[];
}

export type StreamableSources = Record<string, Record<string, StreamingServer[]>>;

export interface MovieMetadata {
  title: string;
  origin_name?: string;
  year: string;
  tmdb_id?: number;
  poster: string;
  thumb_url?: string;
  content?: string;
  quality?: string;
  lang?: string;
  time?: string;
  category: { name: string }[];
  actor: string[];
  director: string[];
  tmdb_seasons?: any[];
  poster_url?: string;
  overview?: string;
  id?: string | number;
  media_type?: string;
}

export interface MediaItem {
  title: string;
  origin_name: string;
  poster: string;
  year: string;
  slug: string;
  media_type: 'movie' | 'tv';
}
