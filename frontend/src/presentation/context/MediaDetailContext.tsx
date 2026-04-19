import React, { createContext, useContext, useState, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import type { BaseMedia } from '../../domain/models/Media';
import type { StreamableSources, StreamingServer } from '../../api/config';
import { api } from '../../api/config';
import { GetMediaDetail } from '../../core/use-cases/GetMediaDetail';

interface SeasonBoundary {
  name: string;
  season_number: number;
  start: number;
  end: number;
}

interface UserSettings {
  preferred_source?: string;
  [key: string]: any;
}

interface MediaDetailContextType {
  // Data
  media: BaseMedia | null;
  loading: boolean;
  localExists: boolean;
  
  // Streaming State
  streamableSources: StreamableSources;
  activeType: string;
  activeProvider: string;
  activeServerIdx: number;
  activeEpisodeIdx: number;
  activeSeasonIdx: number;
  activeEmbed: string | null;
  
  // Handlers
  setMedia: (m: BaseMedia | null) => void;
  setLoading: (l: boolean) => void;
  setLocalExists: (e: boolean) => void;
  setActiveType: (t: string) => void;
  setActiveProvider: (p: string) => void;
  setActiveServerIdx: (idx: number) => void;
  setActiveEpisodeIdx: (idx: number) => void;
  setActiveSeasonIdx: (idx: number) => void;
  setActiveEmbed: (url: string | null) => void;
  
  // Player State
  isPlayerReady: boolean;
  playerError: string | null;
  setIsPlayerReady: (ready: boolean) => void;
  setPlayerError: (error: string | null) => void;
  userSettings: UserSettings | null;
  setUserSettings: (s: UserSettings | null) => void;
  
  // Helpers
  streamingLinks: StreamingServer[];
  seasonBoundaries: SeasonBoundary[];
  setStreamingLinks: (links: StreamingServer[]) => void;
  setStreamableSources: React.Dispatch<React.SetStateAction<StreamableSources>>;
  
  // Actions
  onBack: () => void;
  
  // Metadata Shorthands
  slug: string;
  mediaType: string;
  initialSeason?: number;
  initialEpisode?: number;
}

const MediaDetailContext = createContext<MediaDetailContextType | undefined>(undefined);

export const MediaDetailProvider = ({ children, initialValues }: { children: ReactNode, initialValues: any }) => {
  const { slug, mediaType } = initialValues;

  const [media, setMedia] = useState<BaseMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [localExists, setLocalExists] = useState(false);
  
  const [streamableSources, setStreamableSources] = useState<StreamableSources>({});
  const [activeType, setActiveType] = useState<string>('');
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [activeServerIdx, setActiveServerIdx] = useState(0);
  const [activeEpisodeIdx, setActiveEpisodeIdx] = useState(0);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  const [activeEmbed, setActiveEmbed] = useState<string | null>(null);
  const [streamingLinks, setStreamingLinks] = useState<StreamingServer[]>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);

  const fetchLock = useRef<string | null>(null);

  // Derived: Season boundaries
  const seasonBoundaries = useMemo(() => {
    if (!media || media.type !== 'tv') return [];
    const tv = media as any; 
    let current = 0;
    return (tv.seasons || []).map((s: any): SeasonBoundary => {
        const boundary = { 
            name: s.name, 
            season_number: s.season_number, 
            start: current, 
            end: current + s.episode_count 
        };
        current += s.episode_count;
        return boundary;
    });
  }, [media]);

  // Centralized Data Fetching with Single-Flight Lock
  useEffect(() => {
    // If already fetching or fetched this slug, skip
    if (fetchLock.current === slug) return;
    fetchLock.current = slug;

    let isMounted = true;
    const fetchData = async () => {
        if (!slug) return;
        
        // Reset old state immediately
        setMedia(null);
        setLoading(true);
        setStreamableSources({});
        setActiveEmbed(null);
        setStreamingLinks([]);

        try {
            const useCase = new GetMediaDetail();
            const mediaInstance = await useCase.execute(mediaType, slug);
            
            if (isMounted) {
                setMedia(mediaInstance);
                const rawData = (mediaInstance as any)._rawResponse; 
                setLocalExists(rawData?.data?.local?.exists || false);
            }

            const sRes = await api.get('/user/settings');
            if (isMounted) setUserSettings(sRes.data);

        } catch (err) {
            console.error('[DetailContext] Initial load failed:', err);
        } finally {
            if (isMounted) setLoading(false);
        }
    };

    fetchData();
    return () => { isMounted = false; fetchLock.current = null; };
  }, [slug, mediaType]);

  const value = {
    media, setMedia,
    loading, setLoading,
    localExists, setLocalExists,
    streamableSources, setStreamableSources,
    activeType, setActiveType,
    activeProvider, setActiveProvider,
    activeServerIdx, setActiveServerIdx,
    activeEpisodeIdx, setActiveEpisodeIdx,
    activeSeasonIdx, setActiveSeasonIdx,
    activeEmbed, setActiveEmbed,
    streamingLinks, setStreamingLinks,
    isPlayerReady, setIsPlayerReady,
    playerError, setPlayerError,
    userSettings, setUserSettings,
    seasonBoundaries,
    onBack: initialValues.onBack,
    slug,
    mediaType,
    initialSeason: initialValues.initialSeason,
    initialEpisode: initialValues.initialEpisode,
  };

  return (
    <MediaDetailContext.Provider value={value}>
      {children}
    </MediaDetailContext.Provider>
  );
};

export const useMediaDetail = () => {
  const context = useContext(MediaDetailContext);
  if (context === undefined) {
    throw new Error('useMediaDetail must be used within a MediaDetailProvider');
  }
  return context;
};
