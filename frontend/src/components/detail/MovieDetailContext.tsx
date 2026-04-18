import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { MovieMetadata, StreamingServer } from '../../api/config';

interface MovieDetailContextType {
  // Data
  metadata: MovieMetadata | null;
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
  setActiveType: (t: string) => void;
  setActiveProvider: (p: string) => void;
  setActiveServerIdx: (idx: number) => void;
  setActiveEpisodeIdx: (idx: number) => void;
  setActiveSeasonIdx: (idx: number) => void;
  setActiveEmbed: (url: string | null) => void;
  
  // Discovery & Resolvers
  isTorrentStreaming: boolean;
  isFshareResolving: boolean;
  isPlayerReady: boolean;
  playerError: string | null;
  setIsPlayerReady: (ready: boolean) => void;
  setPlayerError: (error: string | null) => void;
  userSettings: any;
  setUserSettings: (s: any) => void;
  
  // Handlers
  handleTorrentStream: (magnet: string, serverName: string, epIdx: number, srvIdx: number) => Promise<void>;
  handleFshareStream: (url: string, serverName: string, epIdx: number, srvIdx: number) => Promise<void>;
  handleFshareLogin: (e: React.FormEvent) => Promise<void>;
  
  // Helpers
  streamingLinks: any[];
  setStreamingLinks: (links: any[]) => void;
  setStreamableSources: React.Dispatch<React.SetStateAction<Record<string, Record<string, any[]>>>>;
  
  // Actions
  onBack: () => void;
  slug: string;
  mediaType: string;
}

const MovieDetailContext = createContext<MovieDetailContextType | undefined>(undefined);

export const MovieDetailProvider = ({ children, initialValues }: { children: ReactNode, initialValues: any }) => {
  const [metadata, setMetadata] = useState<MovieMetadata | null>(initialValues.metadata || null);
  const [loading, setLoading] = useState(initialValues.loading ?? true);
  const [localExists, setLocalExists] = useState(false);
  
  const [streamableSources, setStreamableSources] = useState<Record<string, Record<string, any[]>>>({});
  const [activeType, setActiveType] = useState<string>('');
  const [activeProvider, setActiveProvider] = useState<string>('');
  const [activeServerIdx, setActiveServerIdx] = useState(0);
  const [activeEpisodeIdx, setActiveEpisodeIdx] = useState(0);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  const [activeEmbed, setActiveEmbed] = useState<string | null>(null);
  const [streamingLinks, setStreamingLinks] = useState<any[]>([]);
  const [isTorrentStreaming, setIsTorrentStreaming] = useState(false);
  const [isFshareResolving, setIsFshareResolving] = useState(false);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<any>(null);

  // Reset state on slug change
  useEffect(() => {
    setMetadata(null);
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
    metadata, setMetadata,
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
    isTorrentStreaming, setIsTorrentStreaming,
    isFshareResolving, setIsFshareResolving,
    isPlayerReady, setIsPlayerReady,
    playerError, setPlayerError,
    userSettings, setUserSettings,
    handleTorrentStream: initialValues.handleTorrentStream,
    handleFshareStream: initialValues.handleFshareStream,
    handleFshareLogin: initialValues.handleFshareLogin,
    onBack: initialValues.onBack,
    slug: initialValues.slug,
    mediaType: initialValues.mediaType,
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
