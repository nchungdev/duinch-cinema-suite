import axios from 'axios';

// In production behind Nginx, we use the relative /api path to ensure Same-Origin requests
export const API_BASE = '/api';

export const api = axios.create({
  baseURL: API_BASE,
});

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
}


export interface DiscoveryResponse {
  items: MediaItem[];
  pagination: {
    totalPages: number;
    currentPage: number;
  };
  success: boolean;
}

export interface DetailResponse {
  metadata: MovieMetadata;
  links: {
    streaming: StreamingServer[];
    fshare: MediaLink[];
    web: MediaLink[];
  };
  local: {
    exists: boolean;
    path?: string;
  };
}
