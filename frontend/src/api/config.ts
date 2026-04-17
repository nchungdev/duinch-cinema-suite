import axios from 'axios';

// In production behind Nginx, we use the relative /api path to ensure Same-Origin requests
export const API_BASE = '/api';

// Anonymous Device Identification
const getDeviceId = () => {
  let id = localStorage.getItem('cinema_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('cinema_device_id', id);
  }
  return id;
};

export const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'X-Device-ID': getDeviceId()
  }
});

export const getProxiedImageUrl = (url: string) => {
  if (!url || !url.startsWith('http')) return url;
  return `${API_BASE}/proxy/image?url=${encodeURIComponent(url)}`;
};

// Response interceptor to handle the new { data, error_code, error_msg } format
api.interceptors.response.use(
  (response) => {
    const { data, error_code, error_msg } = response.data;
    if (error_code !== 0) {
      console.error(`API Error (${error_code}): ${error_msg}`);
      return Promise.reject(new Error(error_msg || 'Unknown API Error'));
    }
    // Return only the inner data to keep component logic simple
    return { ...response, data };
  },
  (error) => {
    return Promise.reject(error);
  }
);

export interface MediaItem {
  title: string;
  origin_name?: string;
  slug: string;
  poster: string;
  year: string;
  media_type: 'movie' | 'tv';
}

export interface MediaLink {
  name: string;
  url: string;
  source: string;
}

export interface StreamingEpisode {
  name: string;
  m3u8: string;
  embed?: string;
}

export interface StreamingServer {
  server_name: string;
  server_data: StreamingEpisode[];
}

export interface MovieMetadata {
  title: string;
  origin_name?: string;
  year: string;
  tmdb_id?: number;
  overview?: string;
  media_type: 'movie' | 'tv';
  poster: string;
  type?: string;
  links?: StreamingServer[];
  tmdb_seasons?: { season_number: number; name: string; episode_count: number }[];
  content?: string;
  thumb_url?: string;
  poster_url?: string;
  time?: string;
  quality?: string;
  lang?: string;
  category?: { name: string }[];
  actor?: string[];
}


export interface DiscoveryResponse {
  results: MediaItem[];
  pagination: {
    totalPages: number;
    currentPage: number;
  };
}

export interface DetailResponse {
  metadata: MovieMetadata;
  local: {
    exists: boolean;
    path?: string;
  };
  links?: {
    streaming?: StreamingServer[];
    fshare?: any[];
    web?: any[];
  };
}

