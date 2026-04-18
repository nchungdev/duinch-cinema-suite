import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { BaseMedia } from '../../domain/models/Media';

interface MovieDetailContextType {
  // Data
  media: BaseMedia | null;
  loading: boolean;
  localExists: boolean;
  
  // Streaming State
  streamableSources: Record<string, Record<string, any[]>>;
  activeType: string;
  activeProvider: string;
  activeServerIdx: number;
  activeEpisodeIdx: number;
  activeSeasonIdx: number;
  activeEmbed: string | null;
  
  // Handlers
  setMedia: (m: BaseMedia | null) => void;
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
  userSettings: any;
  setUserSettings: (s: any) => void;
  
  // Helpers
  streamingLinks: any[];
  seasonBoundaries: any[];
  setStreamingLinks: (links: any[]) => void;
  setStreamableSources: React.Dispatch<React.SetStateAction<Record<string, Record<string, any[]>>>>;
  
  // Actions
  onBack: () => void;
  handleFshareLogin: (e: React.FormEvent) => Promise<void>;
  
  // Metadata Shorthands
  slug: string;
  mediaType: string;
  initialSeason?: number;
  initialEpisode?: number;
}

const MovieDetailContext = createContext<MovieDetailContextType | undefined>(undefined);

export const MovieDetailProvider = ({ children, initialValues }: { children: ReactNode, initialValues: any }) => {
  const [media, setMedia] = useState<BaseMedia | null>(null);
  const [loading, setLoading] = useState(true);
  const [localExists, setLocalExists] = useState(false);
  
  const [streamableSources, setStreamableSources] = useState<Record<string, Record<string, any[]>>>({});
  const [activeType, setActiveType] = useState<string>('');
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [activeServerIdx, setActiveServerIdx] = useState(0);
  const [activeEpisodeIdx, setActiveEpisodeIdx] = useState(0);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  const [activeEmbed, setActiveEmbed] = useState<string | null>(null);
  const [streamingLinks, setStreamingLinks] = useState<any[]>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<any>(null);

  // Derived: Season boundaries for UI navigation
  const seasonBoundaries = React.useMemo(() => {
    if (!media || media.type !== 'tv') return [];
    const tv = media as any; // Cast to access tv-specific seasons
    let current = 0;
    return (tv.seasons || []).map((s: any) => {
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

  // Reset state on slug change
  useEffect(() => {
    setMedia(null);
    setLoading(true);
    setStreamableSources({});
    setActiveType('');
    setActiveProvider('');
    setActiveServerIdx(0);
    setActiveEpisodeIdx(0);
    setActiveSeasonIdx(0);
    setActiveEmbed(null);
    setStreamingLinks([]);
    setIsPlayerReady(false);
    setPlayerError(null);
  }, [initialValues.slug]);

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
    handleFshareLogin: initialValues.handleFshareLogin,
    onBack: initialValues.onBack,
    slug: initialValues.slug,
    mediaType: initialValues.mediaType,
    initialSeason: initialValues.initialSeason,
    initialEpisode: initialValues.initialEpisode,
  };

  return (
    <MovieDetailContext.Provider value={value}>
      {children}
    </MovieDetailContext.Provider>
  );
};

export const useMovieDetail = () => {
  const context = useContext(MovieDetailContext);
  if (context === undefined) {
    throw new Error('useMovieDetail must be used within a MovieDetailProvider');
  }
  return context;
};
