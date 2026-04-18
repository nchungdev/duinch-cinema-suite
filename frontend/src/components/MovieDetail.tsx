import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import Hls from 'hls.js';
import { api, getProxiedImageUrl } from '../api/config';
import { ChevronLeft, ChevronRight, Play, Cloud, Globe, Clock, Star, Calendar, Users, Shield, Tag, Layout, Settings, Loader2, Zap, Activity } from 'lucide-react';

import { DiscoveryPipeline } from './DiscoveryPipeline';

interface MetaData {
  title: string;
  origin_name: string;
  thumb_url: string;
  poster: string;
  poster_url: string;
  content: string;
  year: number | string;
  time: string;
  quality: string;
  lang: string;
  type: string;
  category: { name: string }[];
  actor: string[];
  tmdb_id?: number;
  tmdb_seasons?: { season_number: number; name: string; episode_count: number }[];
}

interface DetailResponse {
  metadata: MetaData;
  local: { exists: boolean; path?: string };
  links?: {
    streaming?: any[];
    fshare?: any[];
    web?: any[];
  }
}

interface MovieDetailProps {
  slug: string;
  mediaType: string;
  category: string;
  initialSeason?: number;
  initialEpisode?: number;
  onBack: () => void;
}

function MarqueeText({ text, className }: { text: string, className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    if (containerRef.current && textRef.current) {
      setShouldAnimate(!!text && textRef.current.offsetWidth > containerRef.current.offsetWidth);
    }
  }, [text]);

  const safeText = text ?? '';
  return (
    <div ref={containerRef} className={`overflow-hidden whitespace-nowrap relative ${className}`}>
      <span
        ref={textRef}
        className={`inline-block ${shouldAnimate ? 'animate-marquee' : ''}`}
        style={shouldAnimate ? { animationDuration: `${Math.max(5, safeText.length * 0.2)}s` } : {}}
      >
        {safeText}
      </span>
      {shouldAnimate && <span className="inline-block pl-8 opacity-0">{safeText}</span>}
    </div>
  );
}

export function MovieDetail({ slug, mediaType, category, initialSeason, initialEpisode, onBack }: MovieDetailProps) {

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEmbed, setActiveEmbed] = useState<string | null>(null);
  const [activeIsEmbed, setActiveIsEmbed] = useState(false); // true = iframe, false = HLS video
  const [activeServerIdx, setActiveServerIdx] = useState(0);
  const [activeEpisodeIdx, setActiveEpisodeIdx] = useState(0);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  const [isInternalScrolling, setIsInternalScrolling] = useState(false);
  const isInternalScrollingRef = useRef(false);
  const [streamingLinks, setStreamingLinks] = useState<any[]>([]);
  // Hierarchical Structure: { [Type]: { [Provider]: Server[] } }
  const [streamableSources, setStreamableSources] = useState<Record<string, Record<string, any[]>>>({});
  
  const [activeType, setActiveType] = useState<string>('');
  const [activeProvider, setActiveProvider] = useState<string>('');
  
  const [userSettings, setUserSettings] = useState<any>(null);
  const [isTorrentStreaming, setIsTorrentStreaming] = useState(false);
  const [isFshareResolving, setIsFshareResolving] = useState(false);
  const [showFshareLogin, setShowFshareLogin] = useState(false);
  const [fshareEmail, setFshareEmail] = useState('');
  const [fsharePassword, setFsharePassword] = useState('');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const handleTorrentStream = async (magnet: string, serverName: string, epIdx: number, srvIdx: number) => {
    setIsTorrentStreaming(true);
    try {
        const res = await api.get<any>(`/stream/torrent?magnet=${encodeURIComponent(magnet)}`);
        
        // Note: api client interceptor already unwraps response.data.data to res.data
        if (res.data?.stream_url) {
            const stream_url = res.data.stream_url;
            setActiveServerIdx(srvIdx);
            setActiveEpisodeIdx(epIdx);
            setActiveEmbed(stream_url); 
            localStorage.setItem('omv_active_server_name', serverName);
        } else {
            const errorMsg = res.data?.detail || res.data?.error_msg || 'Backend failed to initialize stream';
            throw new Error(errorMsg);
        }
    } catch (err: any) {
        console.error('Torrent stream failed:', err);
        const detail = err.response?.data?.detail || err.message;
        alert(`Failed to start torrent stream: ${detail}\n\nPlease ensure 'webtorrent-cli' is installed and services are restarted.`);
    } finally {
        setIsTorrentStreaming(false);
    }
  };

  const handleFshareStream = async (url: string, serverName: string, epIdx: number, srvIdx: number) => {
    setIsFshareResolving(true);
    try {
        const res = await api.get<any>(`/stream/fshare/resolve?url=${encodeURIComponent(url)}`);
        
        if (res.data?.stream_url) {
            const stream_url = res.data.stream_url;
            setActiveServerIdx(srvIdx);
            setActiveEpisodeIdx(epIdx);
            setActiveEmbed(stream_url); 
            localStorage.setItem('omv_active_server_name', serverName);
        } else {
            throw new Error('Backend failed to resolve Fshare link');
        }
    } catch (err: any) {
        console.error('Fshare resolve failed:', err);
        if (err.response?.status === 403) {
            setShowFshareLogin(true);
            alert('Fshare login required for direct streaming.');
        } else {
            alert('Failed to resolve Fshare link. Link might be expired or account restricted.');
        }
    } finally {
        setIsFshareResolving(false);
    }
  };

  const handleFshareLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
        await api.post('/stream/fshare/login', { email: fshareEmail, password: fsharePassword });
        const res = await api.get<{ data: any }>('/user/settings');
        setUserSettings(res.data);
        setShowFshareLogin(false);
        setFsharePassword('');
        alert('Fshare logged in successfully!');
    } catch (err) {
        alert('Fshare login failed. Please check your credentials.');
    }
  };

  const handleStreamingReady = useCallback((links: any[], sourceId: string) => {
    setStreamableSources(prev => {
        const next = { ...prev };
        for (const item of links) {
            const url = item.m3u8 || item.link_m3u8 || item.link_hls || item.url || item.link || item.embed || item.link_embed || item.magnet || '';
            if (!url) continue;

            // Determine all applicable types for this item
            const types: Set<string> = new Set();
            const source_type = (item.source_type || sourceId || '').toLowerCase();
            const rawType = (item.stream_type || item.source_type || '').toUpperCase();
            
            if (rawType === 'P2P' || url.startsWith('magnet:')) {
                types.add('P2P');
            } else if (rawType === 'FSHARE' || rawType === 'GDRIVE' || url.includes('fshare.vn') || url.includes('drive.google.com')) {
                types.add('DIRECT');
            } else {
                // Determine if it should be HLS or EMBED or both
                if (source_type === 'm3u8') types.add('HLS');
                if (item.m3u8 || item.link_m3u8 || item.link_hls || url.includes('.m3u8') || url.includes('hls')) types.add('HLS');
                if (item.embed || item.link_embed || url.includes('embed') || source_type === 'dailymotion') types.add('EMBED');
                
                // Fallback
                if (types.size === 0) types.add('HLS');
            }

            for (const type of Array.from(types)) {
                // Determine Level 2 Platform
                const up = (item.provider || sourceId || '').toUpperCase();
                const ul = url.toLowerCase();
                let platform = up;
                if (type === 'P2P' || up.includes('TORRENT')) platform = 'TORRENT';
                else if (ul.includes('fshare.vn')) platform = 'FSHARE';
                else if (ul.includes('drive.google.com') || ul.includes('google.com/file')) platform = 'GDRIVE';
                else if (ul.includes('dailymotion.com')) platform = 'DAILYMOTION';
                else if (up.includes('KKPHIM')) platform = 'KKPHIM';
                else if (up.includes('OPHIM')) platform = 'OPHIM';

                const scraper = (item.provider || sourceId).toUpperCase();

                if (!next[type]) next[type] = {};
                if (!next[type][platform]) next[type][platform] = [];
                
                const serverKey = item.server || platform;
                let targetServer = next[type][platform].find(s => s.server_name === serverKey);
                
                if (!targetServer) {
                    targetServer = { server_name: serverKey, server_data: [] };
                    next[type][platform].push(targetServer);
                }

                const currentUrl = type === 'HLS' ? (item.m3u8 || item.link_m3u8 || url) : 
                                   type === 'EMBED' ? (item.embed || item.link_embed || url) : url;

                if (!targetServer.server_data.some((ep: any) => ep.url === currentUrl)) {
                    targetServer.server_data.push({
                        name: item.name,
                        m3u8: type === 'HLS' ? currentUrl : '',
                        embed: type === 'EMBED' ? currentUrl : '',
                        magnet: type === 'P2P' ? currentUrl : '',
                        isTorrent: type === 'P2P',
                        stream_type: type,
                        provider: platform,
                        scraper: scraper,
                        url: currentUrl
                    });
                }
            }
        }
        return next;
    });
  }, []);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const res = await api.get<{ data: any }>('/user/settings');
        setUserSettings(res.data);
      } catch (err) {
        console.warn('Failed to load settings:', err);
        setUserSettings({ preferred_source: 'auto' });
      }
    };
    loadSettings();
  }, []);

  // Smart Source Selection Logic — navigates the hierarchical Type > Provider structure.
  useEffect(() => {
    const types = Object.keys(streamableSources);
    if (types.length === 0 || !userSettings || (activeType && activeProvider)) return;

    const preferred = userSettings.preferred_source || 'auto';

    // 1. User has a specific provider preference
    if (preferred !== 'auto') {
      for (const type of types) {
        if (streamableSources[type][preferred]) {
          setActiveType(type);
          setActiveProvider(preferred);
          return;
        }
      }
    }

    // 2. Auto Selection: Priority EMBED -> HLS -> P2P -> DIRECT
    const typePriority = ['EMBED', 'HLS', 'P2P', 'DIRECT'];
    const providerWeights: Record<string, number> = { KKPHIM: 10, OPHIM: 5, TORRENT: 8, TIMFSHARE: 7 };
    
    const bestType = typePriority.find(t => streamableSources[t] && Object.keys(streamableSources[t]).length > 0);
    if (!bestType) return;

    const providers = Object.keys(streamableSources[bestType]);
    const bestProvider = providers.reduce((best, curr) => {
      const bestEpCount = streamableSources[bestType][best].reduce((sum, s) => sum + s.server_data.length, 0);
      const currEpCount = streamableSources[bestType][curr].reduce((sum, s) => sum + s.server_data.length, 0);
      
      if (currEpCount > bestEpCount) return curr;
      if (currEpCount === bestEpCount) {
        return (providerWeights[curr] || 0) > (providerWeights[best] || 0) ? curr : best;
      }
      return best;
    });

    setActiveType(bestType);
    setActiveProvider(bestProvider);
  }, [streamableSources, userSettings, activeType, activeProvider]);

  // Sync activeType/Provider to streamingLinks for the UI
  useEffect(() => {
    if (activeType && activeProvider && streamableSources[activeType]?.[activeProvider]) {
      setStreamingLinks(streamableSources[activeType][activeProvider]);
    }
  }, [activeType, activeProvider, streamableSources]);
  const [showSourceMenu, setShowSourceMenu] = useState(false);
  const [ribbonAtStart, setRibbonAtStart] = useState(true);
  const [ribbonAtEnd, setRibbonAtEnd] = useState(false);

  // Ref so play effect can read latest sources without being in its dep array
  const streamableSourcesRef = useRef<Record<string, Record<string, any[]>>>({});
  streamableSourcesRef.current = streamableSources;

  const episodeListRef = useRef<HTMLDivElement>(null);
  const seasonRibbonRef = useRef<HTMLDivElement>(null);
  const seasonRibbonButtonsRef = useRef<{ [key: number]: HTMLButtonElement | null }>({});
  const serverRibbonRef = useRef<HTMLDivElement>(null);
  const serverRibbonButtonsRef = useRef<{ [key: number]: HTMLButtonElement | null }>({});
  const seasonRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const episodeRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const miniPlayerSentinelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);

  const totalEpisodes = streamingLinks?.[0]?.server_data?.length ?? 0;

  const seasonBoundaries = useMemo(() => {
    const rawBoundaries = (data?.metadata.tmdb_seasons || []).reduce((acc: any[], s: any) => {
      const last = acc[acc.length - 1];
      const start = last ? last.end : 0;
      acc.push({ start, end: start + s.episode_count, name: s.name, num: s.season_number });
      return acc;
    }, []);
    return rawBoundaries.length > 0
      ? rawBoundaries
      : totalEpisodes > 0
        ? [{ start: 0, end: totalEpisodes, name: 'Season 1', num: 1 }]
        : [];
  }, [data, totalEpisodes]);

  const scrollToSeason = (idx: number) => {
      const target = seasonRefs.current[idx];
      const container = episodeListRef.current;
      if (target && container) {
          isInternalScrollingRef.current = true;
          setIsInternalScrolling(true);
          setActiveSeasonIdx(idx);
          const top = target.offsetTop;
          container.scrollTo({ top, behavior: 'smooth' });
          setTimeout(() => {
              isInternalScrollingRef.current = false;
              setIsInternalScrolling(false);
          }, 800);
      }
  };

  useEffect(() => {
    const container = episodeListRef.current;
    if (!container) return;

    const onScroll = () => {
      if (isInternalScrollingRef.current) return;
      if (seasonBoundaries.length === 0) return;

      const scrollTop = container.scrollTop;

      let newSeasonIdx = 0;
      for (let i = seasonBoundaries.length - 1; i >= 0; i--) {
        const el = seasonRefs.current[i];
        if (el && el.offsetTop <= scrollTop + 10) {
          newSeasonIdx = i;
          break;
        }
      }

      setActiveSeasonIdx(prev => prev !== newSeasonIdx ? newSeasonIdx : prev);
    };

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [seasonBoundaries]);

  useEffect(() => {
    const ribbon = seasonRibbonRef.current;
    if (!ribbon) return;
    const update = () => {
      setRibbonAtStart(ribbon.scrollLeft <= 0);
      setRibbonAtEnd(ribbon.scrollLeft + ribbon.clientWidth >= ribbon.scrollWidth - 1);
    };
    update();
    ribbon.addEventListener('scroll', update, { passive: true });
    return () => ribbon.removeEventListener('scroll', update);
  }, [seasonBoundaries]);

  useEffect(() => {
    const fetchDetail = async () => {
      // Reset sources on new slug
      setStreamableSources({});
      setStreamingLinks([]);
      setActiveType('');
      setActiveProvider('');

      try {
        const res = await api.get<DetailResponse>(`/${mediaType}/${slug}`);
        const detailData = res.data;
        setData(detailData);
        
        if (detailData.metadata?.tmdb_seasons && initialSeason) {
            const sIdx = detailData.metadata.tmdb_seasons.findIndex(s => s.season_number === initialSeason);
            if (sIdx !== -1) {
                setActiveSeasonIdx(sIdx);
                if (initialEpisode) {
                    setActiveEpisodeIdx(initialEpisode - 1);
                }
            }
        } else {
            // Check Local History (which might have been synced by App.tsx)
            const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
            const progress = progressStore[slug];
            if (progress) {
                setActiveSeasonIdx(progress.s_idx || 0);
                setActiveEpisodeIdx(progress.e_idx || 0);
            }
        }
      } catch (err) {
        console.error('Fetch detail failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [slug, mediaType]);

  useEffect(() => {
    const target = episodeRefs.current[activeEpisodeIdx];
    const container = episodeListRef.current;
    if (target && container && !isInternalScrolling) {
        const top = target.offsetTop - (container.offsetHeight / 2) + (target.offsetHeight / 2);
        container.scrollTo({ top, behavior: 'smooth' });
    }
  }, [activeEpisodeIdx]);

  // Auto-focus active season tab in the ribbon
  useEffect(() => {
      if (seasonRibbonButtonsRef.current[activeSeasonIdx]) {
          seasonRibbonButtonsRef.current[activeSeasonIdx]?.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'center'
          });
      }
  }, [activeSeasonIdx]);

  // Auto-focus active server tab in the sidebar
  // block: 'nearest' — chỉ scroll trong container, không kéo cả viewport
  useEffect(() => {
    if (serverRibbonButtonsRef.current[activeServerIdx]) {
      serverRibbonButtonsRef.current[activeServerIdx]?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      });
    }
  }, [activeServerIdx]);

  // Save progress locally (updated_at will be used for sync)
  useEffect(() => {
    if (!data) return;
    
    const progressStore = JSON.parse(localStorage.getItem('omv_watch_progress') || '{}');
    progressStore[slug] = {
      s_idx: activeSeasonIdx,
      e_idx: activeEpisodeIdx,
      title: data.metadata?.title,
      type: mediaType,
      updated_at: Date.now()
    };
    localStorage.setItem('omv_watch_progress', JSON.stringify(progressStore));
  }, [activeSeasonIdx, activeEpisodeIdx, slug, data, mediaType]);

  useEffect(() => {
    if (!data) return;
    const sNum = data.metadata?.tmdb_seasons?.[activeSeasonIdx]?.season_number;
    const eNum = activeEpisodeIdx + 1;
    
    // Recovery: Check for saved source on mount or data change
    // Handled by Smart Source Selection Logic now

    const hash = window.location.hash;
    const qPart = hash.includes('?q=') ? `q=${new URLSearchParams(hash.split('?')[1]).get('q')}` : '';
    
    let newHash = `#/${category}/${mediaType}/${slug}`;
    const params = new URLSearchParams();
    if (qPart) params.set('q', new URLSearchParams(hash.split('?')[1]).get('q')!);
    if (mediaType === 'tv' && sNum !== undefined) {
        params.set('s', sNum.toString());
        params.set('e', eNum.toString());
    }
    
    const paramString = params.toString();
    if (paramString) newHash += `?${paramString}`;

    if (window.location.hash !== newHash) {
        window.history.replaceState(null, '', newHash);
    }
  }, [activeSeasonIdx, activeEpisodeIdx, data, slug, mediaType, category]);

  // Play effect — fires exactly once per meaningful selection change.
  // Reads streamableSources via ref so it does NOT re-fire when new sources arrive
  // (that would cause double-setup: once with server 0, again after sync effect restores saved server).
  useEffect(() => {
    const servers = streamableSourcesRef.current[activeType]?.[activeProvider];
    const server = servers?.[activeServerIdx];
    if (!server) return;

    let ep = null;
    if (mediaType === 'movie') {
      ep = server.server_data[activeEpisodeIdx];
    } else {
      const currentEpNum = activeEpisodeIdx + 1;
      const extractNum = (name: string) => { const m = name?.match(/\d+/); return m ? parseInt(m[0]) : null; };
      ep = server.server_data.find((item: any) => extractNum(item.name) === currentEpNum)
        ?? server.server_data[activeEpisodeIdx];
    }

    const embedUrl = ep?.embed || null;
    let m3u8Url  = ep?.m3u8 || ep?.url || null;
    
    if (ep?.stream_type === 'P2P' || ep?.stream_type === 'DIRECT' || ep?.isTorrent) {
        m3u8Url = null; // Prevent raw magnet/direct links from being auto-played by the basic HLS handler
    }

    const url      = embedUrl || m3u8Url;
    const isEmbed  = !!embedUrl;

    if (url && url !== activeEmbed) {
      setActiveIsEmbed(isEmbed);
      setActiveEmbed(null);
      setTimeout(() => setActiveEmbed(url), 10);
    }
    // deps: only real selection signals — NOT streamableSources (via ref) or userSettings
  }, [activeType, activeProvider, activeServerIdx, activeEpisodeIdx, mediaType]);

  // Dùng flag thay vì đoán từ URL string — tránh trường hợp embed URL chứa ".m3u8" trong query param
  const isM3u8 = !!activeEmbed && !activeIsEmbed;

  useEffect(() => {
    if (!isM3u8) return;                  // iframe mode — HLS.js not needed
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (!activeEmbed) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(activeEmbed);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (userSettings?.auto_play !== false) video.play().catch(() => {});
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeEmbed;
      if (userSettings?.auto_play !== false) video.play().catch(() => {});
    }

    return () => { hlsRef.current?.destroy(); hlsRef.current = null; };
  }, [activeEmbed, isM3u8, userSettings?.auto_play]);

  // Sync effect — updates UI list + restores saved server when source/sources change.
  // Changing activeServerIdx here will trigger the play effect exactly once (its dep).
  useEffect(() => {
    if (!activeType || !activeProvider || !streamableSources[activeType]?.[activeProvider]) return;
    const servers = streamableSources[activeType][activeProvider];
    setStreamingLinks(servers);

    const savedServerName = localStorage.getItem('omv_active_server_name');
    if (savedServerName) {
      const sIdx = servers.findIndex((s: any) => s.server_name === savedServerName);
      if (sIdx !== -1 && sIdx !== activeServerIdx) {
        setActiveServerIdx(sIdx); // play effect fires once with correct server
      }
    }
  }, [activeType, activeProvider, streamableSources]);

  if (loading) return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6">
      <div className="w-16 h-16 border-2 border-blue-500/10 border-t-blue-500 rounded-full animate-spin shadow-[0_0_30px_rgba(37,99,235,0.2)]"></div>
      <span className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-500/60 animate-pulse">Synchronizing Metadata</span>
    </div>
  );

  if (!data) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
        <span className="text-red-500/50 italic font-black text-6xl">404</span>
        <div className="text-center space-y-2">
            <h2 className="text-2xl font-black uppercase italic tracking-tighter">Transmission Failed</h2>
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Resource not found in the current sector</p>
        </div>
        <button onClick={onBack} className="mt-4 px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Return to Command</button>
    </div>
  );

  const { metadata } = data;
  if (!metadata) return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6">
      <span className="text-yellow-500/50 italic font-black text-6xl">500</span>
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-black uppercase italic tracking-tighter">Metadata Unavailable</h2>
        <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Source returned an empty manifest</p>
      </div>
      <button onClick={onBack} className="mt-4 px-8 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">Return to Command</button>
    </div>
  );

  const scrollSeasonRibbon = (dir: 'l' | 'r') => {
      if (seasonRibbonRef.current) {
          const amount = dir === 'l' ? -200 : 200;
          seasonRibbonRef.current.scrollBy({ left: amount, behavior: 'smooth' });
      }
  };

  return (
    <div className="relative animate-cinema-fade space-y-16 pb-24">
      <div className="w-full flex justify-start -mt-4 px-4 md:px-10 mb-8 max-w-screen-2xl mx-auto">
        <button onClick={onBack} className="group/back flex items-center gap-3 text-blue-500/80 hover:text-blue-400 transition-all font-black uppercase tracking-[0.3em] text-[10px]">
          <div className="w-8 h-8 rounded-full border border-blue-500/20 flex items-center justify-center group-hover/back:bg-blue-500/10 transition-all">
              <ChevronLeft className="w-4 h-4" />
          </div>
          Return to Galaxy
        </button>
      </div>

      <div className="flex flex-col xl:flex-row gap-8 w-full max-w-screen-2xl mx-auto px-4 md:px-10">
         <div className="flex-1 w-full bg-[#030303] rounded-[2rem] shadow-[0_0_80px_rgba(37,99,235,0.1)] ring-1 ring-white/10 overflow-hidden relative flex items-center justify-center group"
              style={{ height: 'calc(100vh - 260px)', minHeight: '400px' }}>
            {activeEmbed && !isM3u8 && (
              <iframe
                key={activeEmbed}
                src={userSettings?.auto_play !== false && !activeEmbed.includes('autoplay')
                  ? activeEmbed + (activeEmbed.includes('?') ? '&' : '?') + 'autoplay=1'
                  : activeEmbed}
                allowFullScreen
                allow="autoplay; fullscreen"
                className="w-full h-full border-0 absolute inset-0 animate-cinema-fade"
              />
            )}
            <video
              ref={videoRef}
              controls
              playsInline
              className={`w-full h-full absolute inset-0 bg-black ${activeEmbed && isM3u8 ? 'animate-cinema-fade' : 'hidden'}`}
            />
            {!activeEmbed && (
               <div className="flex flex-col items-center gap-4 text-gray-500">
                  <Play className="w-16 h-16 opacity-30" />
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black">Standing By</span>
               </div>
            )}
         </div>

         <div className="w-full xl:w-fit flex flex-col gap-3 min-h-0"
              style={{ height: 'calc(100vh - 260px)', minHeight: '400px' }}>
           {(() => {
             const playingServer = streamingLinks[activeServerIdx]?.server_name;
             const hasPlayback = !!activeEmbed;
             const cardCls = `rounded-2xl border overflow-hidden transition-all duration-500 shrink-0 ${
               hasPlayback
                 ? 'bg-[#0a1a0f] border-green-500/30 shadow-[0_0_30px_rgba(74,222,128,0.1)]'
                 : 'bg-[#0c0c0e] border-white/[0.08]'
             }`;

             const cardContent = (
               <>
                 <div className="flex items-stretch gap-0">
                   <div className="w-16 shrink-0 relative overflow-hidden">
                     <img src={getProxiedImageUrl(metadata.poster_url || metadata.poster || metadata.thumb_url)}
                       className="w-full h-full object-cover" alt=""
                       onError={e => { e.currentTarget.style.display = 'none'; }} />
                     <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a1a0f]/80" />
                   </div>
                   <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
                     {hasPlayback ? (
                       <>
                         <div className="flex-1 min-w-0">
                           <div className="flex items-center gap-2 mb-0.5">
                             <span className="text-[7px] font-black uppercase tracking-[0.25em] text-green-500/70 block leading-none">Now Playing</span>
                             <div className="flex items-end gap-[1.5px] h-2.5">
                               {[0, 0.2, 0.4, 0.1].map((d, i) => (
                                 <span key={i} className="w-[1.5px] bg-green-500/50 rounded-full origin-bottom"
                                   style={{ height: '100%', animation: `eqBar 0.6s ease-in-out ${d}s infinite alternate` }} />
                               ))}
                             </div>
                           </div>
                           <MarqueeText
                                text={metadata.title || metadata.origin_name || 'Unknown'}
                                className="text-[12px] font-black text-white block leading-tight"
                           />
                           {playingServer && (
                             <span className="text-[9px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                               <Globe className="w-2.5 h-2.5 shrink-0" />{playingServer}
                             </span>
                           )}
                         </div>
                       </>
                     ) : (
                       <>
                         <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/[0.08] flex items-center justify-center shrink-0">
                           <Play className="w-3.5 h-3.5 text-gray-600" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <span className="text-[7px] font-black uppercase tracking-[0.25em] text-gray-600 block leading-none mb-0.5">Standing By</span>
                           <span className="text-[11px] font-black text-gray-400 truncate block leading-tight">{metadata.title}</span>
                         </div>
                       </>
                     )}
                   </div>
                 </div>
                 {hasPlayback && <div className="h-[2px] bg-gradient-to-r from-transparent via-green-500/60 to-transparent animate-pulse" />}
               </>
             );

             return (
               <div className="xl:w-[400px] shrink-0">
                 <div className={cardCls}>{cardContent}</div>
               </div>
             );
           })()}

             <div className="relative group/panel flex-1 min-h-0">
               <div 
                 className="w-full xl:w-[400px] h-full flex flex-col rounded-2xl bg-[#08080a]/90 backdrop-blur-3xl border border-white/10 overflow-hidden shadow-2xl relative z-10"
               >
                
                {/* Fshare Login Overlay */}
                {showFshareLogin && (
                    <div className="absolute inset-0 z-[100] bg-black/80 backdrop-blur-xl animate-in fade-in duration-300 flex items-center justify-center p-8">
                        <div className="w-full space-y-6 animate-in slide-in-from-bottom-4 duration-500">
                            <div className="text-center space-y-2">
                                <div className="w-12 h-12 rounded-2xl bg-red-600/20 border border-red-500/40 flex items-center justify-center mx-auto mb-4">
                                    <Cloud className="w-6 h-6 text-red-500" />
                                </div>
                                <h3 className="text-lg font-black uppercase italic tracking-tighter text-white font-outfit">Fshare Authentication</h3>
                                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest leading-relaxed">
                                    Login required for direct high-speed <br/> cloud streaming transmissions.
                                </p>
                            </div>

                            <form onSubmit={handleFshareLogin} className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-600 ml-1">Access Email</label>
                                    <input 
                                        type="email" 
                                        required
                                        value={fshareEmail}
                                        onChange={e => setFshareEmail(e.target.value)}
                                        placeholder="commander@fshare.vn"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-500/40 transition-all"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[8px] font-black uppercase tracking-[0.3em] text-gray-600 ml-1">Authorization Key</label>
                                    <input 
                                        type="password" 
                                        required
                                        value={fsharePassword}
                                        onChange={e => setFsharePassword(e.target.value)}
                                        placeholder="••••••••••••"
                                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-red-500/40 transition-all"
                                    />
                                </div>
                                <div className="flex gap-3 pt-2">
                                    <button 
                                        type="button"
                                        onClick={() => setShowFshareLogin(false)}
                                        className="flex-1 px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all"
                                    >
                                        Abort
                                    </button>
                                    <button 
                                        type="submit"
                                        className="flex-[2] px-4 py-3 rounded-xl bg-red-600 hover:bg-red-500 text-[9px] font-black uppercase tracking-widest text-white shadow-lg shadow-red-600/20 transition-all active:scale-95"
                                    >
                                        Initialize Link
                                    </button>
                                </div>
                            </form>
                            <p className="text-[7px] text-center text-gray-700 uppercase font-bold tracking-widest">Credentials are stored locally in your encrypted SQLite vault.</p>
                        </div>
                    </div>
                )}
                
                {mediaType === 'tv' && seasonBoundaries.length > 0 && (
                  <div className="shrink-0 bg-white/[0.01] border-b border-white/10 flex items-center h-11 relative group/ribbon">
                    {!ribbonAtStart && (
                      <button onClick={() => scrollSeasonRibbon('l')} className="absolute left-0 top-0 bottom-0 px-1 bg-black/40 backdrop-blur-md z-20 opacity-0 group-hover/ribbon:opacity-100 transition-opacity border-r border-white/5">
                          <ChevronLeft className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                    <div ref={seasonRibbonRef} className="flex-1 flex overflow-x-auto no-scrollbar h-full scroll-smooth pr-12">
                        {seasonBoundaries.map((s, idx) => {
                        const isActive = idx === activeSeasonIdx;
                        return (
                            <button key={s.num}
                            ref={el => { seasonRibbonButtonsRef.current[idx] = el; }}
                            onClick={() => scrollToSeason(idx)}
                            className={`px-8 h-full shrink-0 flex items-center justify-center gap-2 transition-all relative ${
                                isActive
                                ? 'bg-blue-600/20 text-blue-400 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-blue-500 shadow-[inset_0_0_20px_rgba(59,130,246,0.1)]'
                                : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
                            }`}>
                            <span className="text-[10px] font-black uppercase tracking-widest text-center">Season {s.num}</span>
                            <span className={`text-[8px] font-bold ${isActive ? 'text-blue-500' : 'opacity-30'}`}>({s.end - s.start})</span>
                            </button>
                        );
                        })}
                    </div>
                    {!ribbonAtEnd && (
                      <button onClick={() => scrollSeasonRibbon('r')} className="absolute right-0 top-0 bottom-0 px-1 bg-black/40 backdrop-blur-md z-20 opacity-0 group-hover/ribbon:opacity-100 transition-opacity border-l border-white/5">
                          <ChevronRight className="w-4 h-4 text-gray-400" />
                      </button>
                    )}
                  </div>
                )}

                {/* Unified Continuous Episode List Container */}
                <div ref={episodeListRef} className="flex-1 overflow-y-auto custom-scrollbar relative">
                  {streamingLinks.length > 0 ? (
                      <div className="flex flex-col bg-white/[0.01]">
                        {mediaType === 'tv' ? (
                            seasonBoundaries.map((s, sIdx) => {
                                const seasonEpCount = s.end - s.start;
                                const offsetStart = s.start;
                                const serverData: any[] = streamingLinks?.[activeServerIdx]?.server_data ?? [];
                                const extractNum = (name: string) => { const m = name?.match(/\d+/); return m ? parseInt(m[0]) : null; };
                                const findEp = (epNum: number) => serverData.find(ep => extractNum(ep.name) === epNum);

                                return (
                                    <div key={sIdx} ref={el => { seasonRefs.current[sIdx] = el; }} data-season={sIdx} className="flex flex-col">
                                        <div className="sticky top-0 z-20 px-5 py-2.5 bg-[#0a0a0c]/90 backdrop-blur-md border-y border-white/5 flex items-center justify-between shadow-lg">
                                            <span className="text-[9px] font-black uppercase tracking-[0.2em] text-blue-500/80 truncate pr-4">{s.name}</span>
                                            <span className="text-[8px] font-black text-gray-600 uppercase tracking-widest shrink-0">{seasonEpCount} Episodes</span>
                                        </div>
                                        <div className="flex flex-col">
                                            {Array.from({ length: seasonEpCount }, (_, localIdx) => {
                                                const epNum = localIdx + 1;
                                                const globalIdx = offsetStart + localIdx;
                                                const ep = findEp(epNum);
                                                const isPlaying = activeEpisodeIdx === globalIdx;
                                                const isFshare = ep?.source_type === 'fshare' || ep?.url?.includes('fshare.vn');
                                                
                                                // Ẩn link fshare nếu chưa login fshare
                                                if (isFshare && !userSettings?.fshare_session) return null;

                                                const hasLink = !!(ep?.m3u8 || ep?.url || ep?.link_m3u8 || ep?.isTorrent || isFshare);
                                                const isLoading = isPlaying && (isTorrentStreaming || isFshareResolving);
                                                const epLabel = `Tập ${String(globalIdx + 1).padStart(2, '0')}`;
                                                const history = JSON.parse(localStorage.getItem('omv_watch_history') || '{}');
                                                const isLastWatched = history[slug]?.s_idx === sIdx && history[slug]?.e_idx === globalIdx;

                                                return (
                                                    <div key={globalIdx} ref={el => { episodeRefs.current[globalIdx] = el; }} className={`flex items-stretch transition-all duration-200 border-b last:border-b-0 border-white/5 ${!hasLink ? 'opacity-35 bg-black/20' : isPlaying ? 'bg-blue-600/20 shadow-inner' : 'hover:bg-white/[0.04] group/ep'}`}>
                                                        <button 
                                                            disabled={!hasLink || isLoading} 
                                                            onClick={() => { 
                                                                if (!hasLink) return; 
                                                                if (ep.isTorrent) {
                                                                    handleTorrentStream(ep.magnet, streamingLinks[activeServerIdx]?.server_name, globalIdx, activeServerIdx);
                                                                } else if (isFshare) {
                                                                    handleFshareStream(ep.url, streamingLinks[activeServerIdx]?.server_name, globalIdx, activeServerIdx);
                                                                } else {
                                                                    setActiveEpisodeIdx(globalIdx); 
                                                                    if (!ep.embed) {
                                                                        const url = ep.url || ep.m3u8 || ep.link_m3u8;
                                                                        if (url) window.open(url, '_blank');
                                                                    }
                                                                }
                                                            }} 
                                                            className="flex-1 min-w-0 flex items-center gap-3 px-4 py-2 disabled:cursor-not-allowed"
                                                        >
                                                        <div className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center transition-all ${isPlaying ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 text-gray-500 group-hover/ep:bg-white/10'}`}>
                                                            {isLoading ? <Loader2 className="w-2 h-2 animate-spin" /> : <Play className={`w-2 h-2 ${isPlaying ? 'fill-current' : ''}`} />}
                                                        </div>
                                                        <div className="flex flex-col min-w-0 items-start">
                                                            <MarqueeText 
                                                                text={epLabel}
                                                                className={`w-full text-[11px] font-black transition-colors ${!hasLink ? 'text-gray-600' : isPlaying ? 'text-white font-black' : 'text-gray-400 group-hover/ep:text-white'}`}
                                                            />
                                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                                <span className="text-[7px] font-bold text-gray-600 uppercase tracking-wider">
                                                                    {ep?.stream_type || 'HLS'}
                                                                </span>
                                                                <div className="w-0.5 h-0.5 rounded-full bg-white/5" />
                                                                <span className="text-[7px] font-bold text-blue-500/40 uppercase tracking-wider">
                                                                    {ep?.provider || 'SOURCE'}
                                                                </span>
                                                            </div>
                                                            {isLastWatched && !isPlaying && (
                                                                <span className="text-[7px] font-black uppercase tracking-wider text-blue-500/60 leading-none mt-1">Last Watched</span>
                                                            )}
                                                        </div>
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })
                        ) : (
                            /* Movie Mode: Simple list of all available servers/links */
                            <div className="flex flex-col">
                                <div className="px-5 py-3.5 border-b border-white/5 bg-white/[0.02]">
                                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-blue-500/60">Available Transmissions</span>
                                </div>
                                {streamingLinks.map((server: any, srvIdx: number) => (
                                    <div key={srvIdx} className="flex flex-col border-b last:border-b-0 border-white/5">
                                        {server.server_data.map((ep: any, epIdx: number) => {
                                            const isPlaying = activeServerIdx === srvIdx && activeEpisodeIdx === epIdx;
                                            const isFshare = ep.source_type === 'fshare' || ep.url?.includes('fshare.vn');
                                            // Ẩn link fshare nếu chưa login fshare
                                            if (isFshare && !userSettings?.fshare_session) return null;
                                            const hasLink = ep.isTorrent || isFshare || !!(ep.m3u8 || ep.embed || ep.link_m3u8);
                                            const isLoading = isPlaying && (isTorrentStreaming || isFshareResolving);
                                            
                                            return (
                                                <div key={epIdx} className={`flex items-stretch transition-all duration-300 ${!hasLink ? 'opacity-35 bg-black/20' : isPlaying ? 'bg-blue-600/20 shadow-inner' : 'hover:bg-white/[0.04] group/ep'}`}>
                                                    <button 
                                                        disabled={!hasLink || isLoading} 
                                                        onClick={() => { 
                                                            if (!hasLink || !ep) return; 
                                                            if (ep.isTorrent) {
                                                                handleTorrentStream(ep.magnet, server.server_name, epIdx, srvIdx);
                                                            } else if (isFshare) {
                                                                handleFshareStream(ep.url, server.server_name, epIdx, srvIdx);
                                                            } else {
                                                                setActiveServerIdx(srvIdx);
                                                                setActiveEpisodeIdx(epIdx); 
                                                                if (!ep.embed) {
                                                                    const url = ep.url || ep.m3u8 || ep.link_m3u8;
                                                                    if (url) window.open(url, '_blank'); 
                                                                }
                                                                localStorage.setItem('omv_active_server_name', server.server_name);
                                                            }
                                                        }} 
                                                        className="flex-1 min-w-0 flex items-center gap-4 px-5 py-4 disabled:cursor-not-allowed"
                                                    >
                                                        <div className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center transition-all duration-500 ${isPlaying ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)] scale-110' : 'bg-white/5 text-gray-500 group-hover/ep:bg-white/10 group-hover/ep:scale-105'}`}>
                                                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className={`w-3 h-3 ${isPlaying ? 'fill-current' : ''}`} />}
                                                        </div>
                                                        <div className="flex flex-col min-w-0 items-start">
                                                            <MarqueeText 
                                                                text={ep?.isTorrent || isFshare ? (ep?.name || 'Unknown') : server.server_name}
                                                                className={`w-full text-[11px] font-black uppercase tracking-[0.15em] transition-colors ${!hasLink ? 'text-gray-600' : isPlaying ? 'text-white' : 'text-gray-300 group-hover/ep:text-white'}`}
                                                            />
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-[8px] font-bold text-gray-600 uppercase tracking-widest leading-none">
                                                                    {ep?.stream_type === 'P2P' ? 'P2P Stream' : 
                                                                     ep?.stream_type === 'HLS' ? 'HLS Feed' : 
                                                                     ep?.stream_type === 'EMBED' ? 'Embed Player' : 
                                                                     ep?.stream_type === 'DIRECT' ? 'Cloud Stream' : 'Digital Transmission'}
                                                                </span>
                                                                <div className="w-1 h-1 rounded-full bg-white/10" />
                                                                <span className={`text-[8px] font-bold uppercase tracking-widest leading-none ${
                                                                    ep?.stream_type === 'P2P' ? 'text-green-500/60' : 
                                                                    ep?.stream_type === 'DIRECT' ? 'text-red-500/60' : 
                                                                    'text-blue-500/40'
                                                                }`}>
                                                                    {ep?.provider || 'Unknown Source'}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </button>
                                                    <div className="flex items-center px-4 gap-1">
                                                        <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-white/5'}`} />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ))}
                                {streamingLinks.length === 0 && (
                                    <div className="py-20 flex flex-col items-center justify-center gap-4 opacity-20">
                                        <Globe className="w-8 h-8" />
                                        <span className="text-[9px] font-black uppercase tracking-widest">No Streams Found</span>
                                    </div>
                                )}
                            </div>
                        )}
                      </div>
               ) : (
                      <div className="h-full flex flex-col items-center justify-center p-12 text-center gap-6">
                        <Globe className="w-10 h-10 text-gray-600 animate-pulse" />
                        <div className="space-y-1">
                          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Đang tìm nguồn...</p>
                        </div>
                      </div>
                    )}
                </div>
              </div>

               {/* 2. Floating/Pinned Side Dock (Sources + Servers) */}
               <div className="absolute left-full top-1/2 -translate-y-1/2 flex flex-col gap-2 py-1 z-40">
                  {/* Settings / Source Toggle */}
                  <div className="relative">
                    <button
                      onClick={() => setShowSourceMenu(!showSourceMenu)}
                      className={`w-9 h-9 rounded-r-xl border-y border-r flex items-center justify-center transition-all ${
                        showSourceMenu
                        ? 'bg-blue-600/30 border-blue-500/50 text-blue-400'
                        : 'bg-white/5 border-white/5 text-gray-600 hover:text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      <Settings className={`w-4 h-4 ${showSourceMenu ? 'animate-spin-slow' : ''}`} />
                    </button>

                    {/* Popover: Stream Sources grouped by Type */}
                    {showSourceMenu && (
                      <div className="absolute right-full bottom-0 mr-3 w-64 bg-[#0c0c0e]/95 backdrop-blur-2xl border border-white/10 rounded-2xl shadow-3xl overflow-hidden flex flex-col z-50 animate-slide-left">
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
                          <div>
                            <span className="text-[8px] font-black uppercase tracking-[0.3em] text-blue-500/80">Transmission Protocols</span>
                            <p className="text-[6px] text-gray-600 uppercase tracking-widest mt-0.5">Control Panel</p>
                          </div>
                          <button 
                            onClick={async () => {
                              const newSettings = { ...userSettings, preferred_source: 'auto' };
                              setUserSettings(newSettings);
                              await api.post('/user/settings', newSettings);
                              setShowSourceMenu(false);
                            }}
                            className={`px-3 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-all ${
                              userSettings?.preferred_source === 'auto' 
                                ? 'bg-blue-600/20 border-blue-500 text-blue-400' 
                                : 'bg-white/5 border-white/10 text-gray-500 hover:text-white'
                            }`}
                          >
                            Auto
                          </button>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar p-2 space-y-4">
                          {[
                            { type: 'EMBED',  icon: <Layout className="w-2.5 h-2.5" />, sources: ['DAILYMOTION', 'KKPHIM', 'OPHIM', 'WEB'] },
                            { type: 'HLS',    icon: <Zap className="w-2.5 h-2.5" />,    sources: ['KKPHIM', 'OPHIM', 'WEB'] },
                            { type: 'P2P',    icon: <Activity className="w-2.5 h-2.5" />, sources: ['TORRENT'] },
                            { type: 'DIRECT', icon: <Cloud className="w-2.5 h-2.5" />, sources: ['FSHARE', 'GDRIVE', 'WEB'] },
                          ].map((group) => {
                            const availableProviders = group.sources.filter(p => (streamableSources[group.type]?.[p]?.length ?? 0) > 0);
                            const isGroupAvailable = availableProviders.length > 0;
                            const isExpanded = expandedGroup === group.type || (!expandedGroup && activeType === group.type);

                            if (!isGroupAvailable) return null;

                            return (
                              <div key={group.type} className="space-y-1.5">
                                <div 
                                    className="px-2 flex items-center justify-between cursor-pointer group/header py-1 hover:bg-white/[0.02] rounded-lg transition-all"
                                    onClick={() => isGroupAvailable && setExpandedGroup(isExpanded ? null : group.type)}
                                >
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1 rounded-md transition-all ${isGroupAvailable ? (isExpanded ? 'bg-blue-500 text-white shadow-[0_0_10px_rgba(59,130,246,0.5)]' : 'bg-blue-500/10 text-blue-500') : 'bg-gray-800 text-gray-600'}`}>
                                            {group.icon}
                                        </div>
                                        <span className={`text-[8px] font-black uppercase tracking-[0.2em] transition-colors ${isExpanded ? 'text-blue-400' : 'text-gray-500 group-hover/header:text-gray-400'}`}>{group.type} FEED</span>
                                    </div>
                                    {isGroupAvailable && (
                                        <ChevronRight className={`w-3 h-3 text-gray-700 transition-transform duration-300 ${isExpanded ? 'rotate-90 text-blue-500' : ''}`} />
                                    )}
                                </div>
                                
                                {isExpanded && (
                                  <div className="grid grid-cols-1 gap-1 pl-1 animate-in fade-in slide-in-from-top-1 duration-200">
                                    {group.sources.map(provId => {
                                      const isActive = provId === activeProvider;
                                      const serverCount = streamableSources[group.type]?.[provId]?.length ?? 0;
                                      const isAvailable = serverCount > 0;
                                      
                                      const srcMeta: Record<string, { label: string; color: string }> = {
                                        KKPHIM:      { label: 'KKPhim',     color: 'text-orange-400 bg-orange-500/10 border-orange-500/30' },
                                        OPHIM:       { label: 'OPhim',      color: 'text-pink-400   bg-pink-500/10   border-pink-500/30'   },
                                        TORRENT:     { label: 'BitTorrent', color: 'text-green-400  bg-green-500/10  border-green-500/30'  },
                                        FSHARE:      { label: 'Fshare.vn',  color: 'text-red-400    bg-red-500/10    border-red-500/30'    },
                                        GDRIVE:      { label: 'G-Drive',    color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
                                        DAILYMOTION: { label: 'DailyMotion',color: 'text-blue-400   bg-blue-500/10   border-blue-500/30'   },
                                        WEB:         { label: 'Web/Cloud',  color: 'text-sky-400    bg-sky-500/10    border-sky-500/30'    },
                                      };
                                      const meta = srcMeta[provId] ?? { label: provId, color: 'text-blue-400 bg-blue-500/10 border-blue-500/30' };

                                      if (!isAvailable) return null;
                                      // Ràng buộc: fshare.vn phải login mới show
                                      if (provId === 'FSHARE' && !userSettings?.fshare_session) return null;

                                      return (
                                        <button key={provId}
                                          disabled={!isAvailable}
                                          onClick={async () => {
                                            if (!isAvailable) return;
                                            setActiveType(group.type);
                                            setActiveProvider(provId);
                                            setShowSourceMenu(false);
                                            
                                            const newSettings = { ...userSettings, preferred_source: provId };
                                            setUserSettings(newSettings);
                                            await api.post('/user/settings', newSettings);
                                          }}
                                          className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border ${
                                            !isAvailable
                                              ? 'opacity-40 border-transparent text-gray-600'
                                              : isActive
                                                ? meta.color
                                                : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-white/5'
                                          }`}
                                        >
                                          <Globe className={`w-2.5 h-2.5 ${!isAvailable ? 'text-gray-800' : ''}`} />
                                          <span className="flex-1 text-left">{meta.label}</span>
                                          <span className="text-[7px] font-bold normal-case tracking-normal opacity-50">
                                            {isAvailable ? `${serverCount} sv` : 'N/A'}
                                          </span>
                                          {isActive && isAvailable && <div className="w-1 h-1 rounded-full bg-current shadow-[0_0_8px_currentColor]" />}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Server Section - Only for TV */}
                  {mediaType === 'tv' && streamingLinks.length > 0 && (
                    <div ref={serverRibbonRef} className="w-9 max-h-[400px] overflow-y-auto no-scrollbar flex flex-col gap-1">
                      {streamingLinks.map((server: any, idx: number) => {
                        const isActive = idx === activeServerIdx;
                        return (
                            <button key={idx}
                                ref={el => { serverRibbonButtonsRef.current[idx] = el; }}
                                onClick={() => { 
                                    setActiveServerIdx(idx); 
                                    setActiveEpisodeIdx(seasonBoundaries[activeSeasonIdx]?.start || 0); 
                                    localStorage.setItem('omv_active_server_name', server.server_name);
                                }}
                                className={`group relative flex items-center justify-center rounded-r-xl transition-all py-14 border-y border-r shrink-0 overflow-hidden ${
                                    isActive 
                                      ? 'bg-blue-600/30 border-blue-500/50 shadow-[3px_0_10px_rgba(37,99,235,0.1)]' 
                                      : 'bg-white/5 border-white/5 hover:text-gray-600 hover:bg-white/10'
                                }`}
                            >
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <span className={`text-[7px] font-black uppercase tracking-widest whitespace-nowrap rotate-90 transition-colors pointer-events-none ${
                                        isActive ? 'text-white' : 'text-gray-600 group-hover:text-gray-400'
                                    }`}>
                                        {server.server_name}
                                    </span>
                                </div>
                            </button>
                        );
                      })}
                    </div>
                  )}
               </div>
            </div>
           </div>
       </div>

      {/* Sentinel — fixed mini player triggers when user scrolls past the top section */}
      <div ref={miniPlayerSentinelRef} className="h-0 w-0 pointer-events-none" />

      <div className="max-w-screen-2xl mx-auto px-4 md:px-10 flex flex-col gap-10 pt-4">
        <div className="flex flex-col xl:flex-row gap-8 w-full items-stretch">
          <section className="flex-1 glass-dark p-8 md:p-12 rounded-3xl border border-white/5 shadow-inner animate-cinema-fade">
            <div className="flex flex-col md:flex-row gap-10 items-start">
              <div className="hidden md:block w-48 shrink-0 aspect-[2/3] rounded-2xl overflow-hidden shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] border border-white/10 group bg-[#050505]">
                <img src={getProxiedImageUrl(metadata.poster_url || metadata.poster || metadata.thumb_url)} className="w-full h-full object-cover transition-transform duration-[2s] group-hover:scale-110" alt="poster" onError={(e) => { e.currentTarget.src = 'https://via.placeholder.com/500x750?text=No+Poster'; }} />
              </div>
              <div className="flex-1 space-y-6">
                <div className="space-y-4">
                   <div className="flex items-center gap-4">
                      <span className="px-3 py-1 rounded-lg bg-blue-600/20 border border-blue-500/30 text-blue-400 text-[10px] font-black uppercase tracking-widest">{metadata.quality || 'HD'}</span>
                      <div className="h-0.5 w-12 bg-white/10 rounded-full" />
                      <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.4em]">{metadata.type || 'Movie'}</span>
                   </div>
                   <h1 className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-black italic uppercase tracking-tighter leading-[0.9] text-gradient font-outfit drop-shadow-2xl">{metadata.title}</h1>
                   <p className="text-lg font-bold text-gray-500 uppercase tracking-[0.25em] opacity-60 font-inter">{metadata.origin_name}</p>
                </div>
                <div className="flex flex-wrap gap-3">
                   <HeroBadge icon={<Calendar className="text-blue-500" />} text={metadata.year?.toString() || 'Unknown'} />
                   <HeroBadge icon={<Clock className="text-purple-500" />} text={metadata.time || 'N/A'} />
                   <HeroBadge icon={<Star className="text-yellow-500" />} text={metadata.lang || 'N/A'} />
                   <HeroBadge icon={<Shield className="text-green-500" />} text="Official Source" />
                </div>
                <div className="pt-4 space-y-4">
                   <div className="flex items-center gap-4">
                      <div className="w-1.5 h-6 bg-blue-600 rounded-full shadow-[0_0_15px_#3b82f6]" />
                      <h2 className="text-xl font-black uppercase tracking-[0.2em] font-outfit text-gray-300">Manifest Summary</h2>
                   </div>
                   <p className="text-gray-400 leading-relaxed text-sm md:text-base font-medium font-inter opacity-90 text-justify" dangerouslySetInnerHTML={{ __html: metadata.content || 'No manifest content available.' }} />
                   <div className="pt-2 flex flex-wrap gap-3">
                      {(metadata.category || []).map(cat => (
                        <div key={cat.name} className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-colors cursor-crosshair">{cat.name}</div>
                      ))}
                   </div>
                </div>
              </div>
            </div>
          </section>

          <div className="w-full xl:w-[400px] shrink-0 flex flex-col gap-8">
              <div className="glass-dark p-8 rounded-3xl border border-white/5 space-y-6 flex-1 bg-[#030303]/40">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                      <Users className="w-4 h-4 text-blue-500/50" />
                      <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-gray-500">Personnel Manifest</h3>
                  </div>
                  <div className="space-y-4">
                      {(metadata.actor || []).slice(0, 5).map(a => (
                          <div key={a} className="flex items-center gap-4 group cursor-pointer transition-all">
                              <div className="w-9 h-9 shrink-0 rounded-xl overflow-hidden border border-white/10 shadow-lg relative group bg-black flex items-center justify-center text-[10px] font-black group-hover:bg-blue-600/30 group-hover:text-blue-200 transition-all duration-500">
                                {a.charAt(0)}
                              </div>
                              <div className="flex flex-col">
                                  <span className="text-xs font-bold text-gray-300 group-hover:text-white transition-colors">{a}</span>
                                  <span className="text-[7px] font-black uppercase tracking-[0.2em] text-gray-600 group-hover:text-blue-500/60 transition-colors">Agent / Class A</span>
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
              <div className="glass p-6 rounded-[2.5rem] border border-white/5 grid grid-cols-2 gap-6 bg-[#030303]/40">
                  <SpecItem icon={<Tag />} label="Format" value={metadata.type} />
                  <SpecItem icon={<Layout />} label="Display" value={metadata.quality} />
              </div>
          </div>
        </div>
        <div className="w-full">
            <DiscoveryPipeline
              tmdbId={metadata.tmdb_id ?? parseInt(slug, 10)}
              title={metadata.origin_name || metadata.title}
              localizeTitle={metadata.origin_name ? metadata.title : undefined}
              year={String(metadata.year || '')}
              mediaType={mediaType}
              season={metadata.tmdb_seasons?.[activeSeasonIdx]?.season_number}
              onStreamingReady={handleStreamingReady}
            />
        </div>
      </div>
    </div>
  );
}

function HeroBadge({ icon, text }: { icon: any, text: string }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 rounded-2xl bg-white/5 border border-white/10 text-xs font-bold uppercase tracking-widest backdrop-blur-xl hover:bg-white/10 transition-all cursor-default">
      <span className="opacity-80 scale-110">{icon}</span>
      <span className="text-gray-200">{text}</span>
    </div>
  );
}

function SpecItem({ icon, label, value }: { icon: any, label: string, value: string }) {
  return (
    <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-widest text-gray-600">{icon} {label}</div>
        <div className="text-[10px] font-black uppercase tracking-wider text-gray-300">{value}</div>
    </div>
  );
}
