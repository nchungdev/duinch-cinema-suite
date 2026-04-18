import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import type { BaseMedia } from '../../domain/models/Media';
import type { StreamableSources, StreamingServer } from '../../api/config';

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
  handleFshareLogin: (e: React.FormEvent) => Promise<void>;
  
  // Metadata Shorthands
  slug: string;
  mediaType: string;
  initialSeason?: number;
  initialEpisode?: number;
}

const MediaDetailContext = createContext<MediaDetailContextType | undefined>(undefined);

export const MediaDetailProvider = ({ children, initialValues }: { children: ReactNode, initialValues: any }) => {
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

  // Derived: Season boundaries for UI navigation
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

  // Reset state on slug change
  useEffect(() => {
    const reset = () => {
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
    };
    reset();
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
