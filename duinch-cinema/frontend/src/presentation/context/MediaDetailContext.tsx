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

export type PlaybackState = 'playing' | 'paused' | 'buffering' | 'stopped';

interface MediaDetailContextType {
  media: BaseMedia | null;
  loading: boolean;
  localExists: boolean;
  streamableSources: StreamableSources;
  activeType: string;
  activeProvider: string;
  activeServerIdx: number;
  activeEpisodeIdx: number;
  activeSeasonIdx: number;
  activeEmbed: string | null;
  playbackState: PlaybackState;
  setMedia: (m: BaseMedia | null) => void;
  setLoading: (l: boolean) => void;
  setLocalExists: (e: boolean) => void;
  setActiveType: (t: string) => void;
  setActiveProvider: (p: string) => void;
  setActiveServerIdx: (idx: number) => void;
  setActiveEpisodeIdx: (idx: number) => void;
  setActiveSeasonIdx: (idx: number) => void;
  setActiveEmbed: (url: string | null) => void;
  setPlaybackState: (s: PlaybackState) => void;
  isPlayerReady: boolean;
  playerError: string | null;
  setIsPlayerReady: (ready: boolean) => void;
  setPlayerError: (error: string | null) => void;
  userSettings: UserSettings | null;
  setUserSettings: (s: UserSettings | null) => void;
  streamingLinks: StreamingServer[];
  seasonBoundaries: SeasonBoundary[];
  setStreamingLinks: (links: StreamingServer[]) => void;
  setStreamableSources: React.Dispatch<React.SetStateAction<StreamableSources>>;
  onBack: () => void;
  slug: string;
  mediaType: string;
  initialSeason?: number;
  initialEpisode?: number;
  isInitialized: boolean;
  setIsInitialized: (i: boolean) => void;
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
  const [playbackState, setPlaybackState] = useState<PlaybackState>('stopped');
  const [streamingLinks, setStreamingLinks] = useState<StreamingServer[]>([]);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState<string | null>(null);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  const fetchingRef = useRef<string | null>(null);

  const seasonBoundaries = useMemo(() => {
    if (!media || media.type !== 'tv') return [];
    const tv = media as any; 
    let current = 0;
    return (tv.seasons || []).map((s: any): SeasonBoundary => {
        const boundary = { name: s.name, season_number: s.season_number, start: current, end: current + s.episode_count };
        current += s.episode_count;
        return boundary;
    });
  }, [media]);

  useEffect(() => {
    if (!slug) return;
    if (fetchingRef.current === slug) return;
    fetchingRef.current = slug;

    let isMounted = true;
    const fetchData = async () => {
        setMedia(null);
        setLoading(true);
        setStreamableSources({}); // Clear discovery data
        setActiveType('');        // Clear selection
        setActiveProvider('');    // Clear selection
        setActiveEmbed(null);
        setStreamingLinks([]);
        setPlaybackState('stopped');
        setIsInitialized(false);

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
            if (isMounted) {
                setLoading(false);
                fetchingRef.current = null;
            }
        }
    };
    fetchData();
    return () => { 
        isMounted = false; 
        fetchingRef.current = null;
    };
  }, [slug, mediaType]);

  // REMOVED: legacy activeSeasonIdx side-effect that wiped streamableSources and playback state.
  // We now fetch all seasons exhaustively on mount, so state should persist across season navigation.

  const value = {
    media, setMedia, loading, setLoading, localExists, setLocalExists,
    streamableSources, setStreamableSources, activeType, setActiveType,
    activeProvider, setActiveProvider, activeServerIdx, setActiveServerIdx,
    activeEpisodeIdx, setActiveEpisodeIdx, activeSeasonIdx, setActiveSeasonIdx,
    activeEmbed, setActiveEmbed, streamingLinks, setStreamingLinks,
    playbackState, setPlaybackState,
    isPlayerReady, setIsPlayerReady, playerError, setPlayerError,
    userSettings, setUserSettings, seasonBoundaries,
    onBack: initialValues.onBack, slug, mediaType,
    initialSeason: initialValues.initialSeason, initialEpisode: initialValues.initialEpisode,
    isInitialized, setIsInitialized
  };

  return <MediaDetailContext.Provider value={value}>{children}</MediaDetailContext.Provider>;
};

export const useMediaDetail = () => {
  const context = useContext(MediaDetailContext);
  if (context === undefined) throw new Error('useMediaDetail must be used within a MediaDetailProvider');
  return context;
};
