import { useEffect, useRef, useState } from 'react';
import { api, getProxiedImageUrl } from '../api/config';
import { ChevronLeft, Calendar, Clock, Play, Shield, Star, Users, Tag, Layout, Globe, HardDrive, Activity } from 'lucide-react';
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

interface Props {
  slug: string;
  mediaType: string;
  category: string;
  initialSeason?: number;
  initialEpisode?: number;
  onBack: () => void;
}

export function MovieDetail({ slug, mediaType, category, initialSeason, initialEpisode, onBack }: Props) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeEmbed, setActiveEmbed] = useState<string | null>(null);
  const [activeServerIdx, setActiveServerIdx] = useState(0);
  const [activeEpisodeIdx, setActiveEpisodeIdx] = useState(0);
  const [activeSeasonIdx, setActiveSeasonIdx] = useState(0);
  // Streaming links populated by DiscoveryPipeline callback (not from detail fetch)
  const [streamingLinks, setStreamingLinks] = useState<any[]>([]);

  // Mini player sticky-scroll tracking
  const miniPlayerSentinelRef = useRef<HTMLDivElement>(null);
  const [miniPlayerFloating, setMiniPlayerFloating] = useState(false);

  useEffect(() => {
    const HEADER_H = 96; // h-20 (80px) + 16px gap
    const onScroll = () => {
      if (!miniPlayerSentinelRef.current) return;
      const top = miniPlayerSentinelRef.current.getBoundingClientRect().top;
      setMiniPlayerFloating(top < HEADER_H);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        // /api/movie/:id or /api/tv/:id — media_type baked into path, never wrong
        const res = await api.get<DetailResponse>(`/${mediaType}/${slug}`);
        const detailData = res.data;
        setData(detailData);
        
        if (detailData.metadata.tmdb_seasons && initialSeason) {
            const sIdx = detailData.metadata.tmdb_seasons.findIndex(s => s.season_number === initialSeason);
            if (sIdx !== -1) {
                setActiveSeasonIdx(sIdx);
                if (initialEpisode) {
                    setActiveEpisodeIdx(initialEpisode - 1);
                }
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

  // MASTER SYNC: Keep URL updated with state
  useEffect(() => {
    if (!data) return;
    const sNum = data.metadata.tmdb_seasons?.[activeSeasonIdx]?.season_number;
    const eNum = activeEpisodeIdx + 1;
    
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

  useEffect(() => {
    const ep = streamingLinks?.[activeServerIdx]?.server_data?.[activeEpisodeIdx];
    if (ep?.embed) setActiveEmbed(ep.embed);
  }, [streamingLinks, activeServerIdx, activeEpisodeIdx]);

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

  const { metadata, local } = data;
  const tmdbSeasons = metadata.tmdb_seasons || [];
  const totalEpisodes = streamingLinks?.[0]?.server_data?.length ?? 0;
  const rawBoundaries = tmdbSeasons.reduce<{ start: number; end: number; name: string; num: number }[]>((acc, s) => {
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    acc.push({ start, end: start + s.episode_count, name: s.name, num: s.season_number });
    return acc;
  }, []);
  // Fallback: nếu không có tmdb_seasons nhưng có episodes → tạo Season 1
  const seasonBoundaries = rawBoundaries.length > 0
    ? rawBoundaries
    : totalEpisodes > 0
      ? [{ start: 0, end: totalEpisodes, name: 'Season 1', num: 1 }]
      : [];
  const currentSeason = seasonBoundaries[activeSeasonIdx];

  // Which season contains the currently playing episode?
  const playingSeasonIdx = activeEmbed
    ? seasonBoundaries.findIndex(s => activeEpisodeIdx >= s.start && activeEpisodeIdx < s.end)
    : -1;
  const playingEpRelative = playingSeasonIdx !== -1
    ? activeEpisodeIdx - (seasonBoundaries[playingSeasonIdx]?.start ?? 0) + 1
    : null;

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
         <div className="flex-1 w-full bg-[#030303] rounded-[2rem] shadow-[0_0_80px_rgba(37,99,235,0.1)] ring-1 ring-white/10 overflow-hidden relative aspect-video flex items-center justify-center group">
            {activeEmbed ? (
               <iframe src={activeEmbed} allowFullScreen className="w-full h-full border-0 absolute inset-0 animate-cinema-fade" />
            ) : (
               <div className="flex flex-col items-center gap-4 text-gray-500">
                  <Play className="w-16 h-16 opacity-30" />
                  <span className="text-[10px] uppercase tracking-[0.2em] font-black">Standing By</span>
               </div>
            )}
         </div>

         {/* Right column: Mini Player + Episode Panel stacked */}
         <div className="w-full xl:w-[400px] flex flex-col gap-3 min-h-0">

           {/* ── Mini Control Player ── standalone card */}
           {(() => {
             const playingServer = streamingLinks[activeServerIdx]?.server_name;
             const hasPlayback = !!activeEmbed;
             const playingSeason = playingSeasonIdx !== -1 ? seasonBoundaries[playingSeasonIdx] : null;
             const totalServerEps = streamingLinks[activeServerIdx]?.server_data?.length ?? 0;
             const maxIdx = (totalServerEps > 0 ? totalServerEps : seasonBoundaries[seasonBoundaries.length - 1]?.end ?? 1) - 1;
             const canPrev = activeEpisodeIdx > 0;
             const canNext = activeEpisodeIdx < maxIdx;
             const goEp = (dir: 1 | -1) => setActiveEpisodeIdx(i => Math.max(0, Math.min(maxIdx, i + dir)));

             const cardCls = `rounded-2xl border overflow-hidden transition-all duration-500 ${
               hasPlayback
                 ? 'bg-[#0a1a0f] border-green-500/30 shadow-[0_0_30px_rgba(74,222,128,0.1)]'
                 : 'bg-[#0c0c0e] border-white/[0.08]'
             }`;

             const cardContent = (
               <>
                 <div className="flex items-stretch gap-0">
                   {/* Poster strip */}
                   <div className="w-16 shrink-0 relative overflow-hidden">
                     <img src={getProxiedImageUrl(metadata.poster_url || metadata.poster || metadata.thumb_url)}
                       className="w-full h-full object-cover" alt=""
                       onError={e => { e.currentTarget.style.display = 'none'; }} />
                     <div className="absolute inset-0 bg-gradient-to-r from-transparent to-[#0a1a0f]/80" />
                   </div>

                   {/* Info + controls */}
                   <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-3">
                     {hasPlayback ? (
                       <>
                         <div className="flex items-end gap-[2px] h-6 shrink-0 self-center">
                           {[0.0, 0.25, 0.1, 0.35].map((delay, i) => (
                             <span key={i} className="w-[3px] rounded-full bg-green-400 origin-bottom"
                               style={{ height: '100%', animation: `eqBar 0.65s ease-in-out ${delay}s infinite alternate` }} />
                           ))}
                         </div>
                         <div className="flex-1 min-w-0">
                           <span className="text-[7px] font-black uppercase tracking-[0.25em] text-green-500/70 block leading-none mb-0.5">Now Playing</span>
                           <span className="text-[12px] font-black text-white truncate block leading-tight">
                             {mediaType === 'tv' && playingSeason
                               ? <>{playingSeason.name || `Season ${playingSeason.num}`}<span className="text-green-500/50 mx-1.5 font-normal">·</span>Tập {String(playingEpRelative).padStart(2, '0')}</>
                               : metadata.title}
                           </span>
                           {playingServer && (
                             <span className="text-[9px] text-gray-500 truncate flex items-center gap-1 mt-0.5">
                               <Globe className="w-2.5 h-2.5 shrink-0" />{playingServer}
                             </span>
                           )}
                         </div>
                         {mediaType === 'tv' ? (
                           <div className="flex items-center gap-1.5 shrink-0">
                             <button onClick={() => goEp(-1)} disabled={!canPrev}
                               className="w-8 h-8 rounded-xl flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-90">
                               <ChevronLeft className="w-4 h-4 text-gray-300" />
                             </button>
                             <button onClick={() => goEp(1)} disabled={!canNext}
                               className="w-8 h-8 rounded-xl flex items-center justify-center bg-green-500/20 border border-green-500/30 hover:bg-green-500/30 disabled:opacity-20 disabled:cursor-not-allowed transition-all active:scale-90">
                               <ChevronLeft className="w-4 h-4 text-green-300 rotate-180" />
                             </button>
                           </div>
                         ) : (
                           <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-green-500/20 border border-green-500/30 shrink-0">
                             <Play className="w-3.5 h-3.5 text-green-400 fill-green-400" />
                           </div>
                         )}
                       </>
                     ) : (
                       <>
                         <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/[0.08] flex items-center justify-center shrink-0">
                           <Play className="w-3.5 h-3.5 text-gray-600" />
                         </div>
                         <div className="flex-1 min-w-0">
                           <span className="text-[7px] font-black uppercase tracking-[0.25em] text-gray-600 block leading-none mb-0.5">Standing By</span>
                           <span className="text-[11px] font-black text-gray-400 truncate block leading-tight">{metadata.title}</span>
                           <span className="text-[9px] text-gray-600 block mt-0.5">
                             {mediaType === 'tv' ? 'Chọn tập để bắt đầu' : 'Chọn server để phát'}
                           </span>
                         </div>
                       </>
                     )}
                   </div>
                 </div>
                 {hasPlayback && <div className="h-[2px] bg-gradient-to-r from-transparent via-green-500/60 to-transparent animate-pulse" />}
               </>
             );

             return (
               <>
                 {/* Natural position card */}
                 <div className="shrink-0">
                   <div className={cardCls}>{cardContent}</div>
                 </div>

                 {/* Fixed clone — appears only after scrolling past the whole top section */}
                 {miniPlayerFloating && (
                   <div className={`${cardCls} fixed top-[88px] right-4 xl:right-10 w-[min(400px,calc(100vw-2rem))] z-50
                                    shadow-[0_8px_32px_rgba(0,0,0,0.6)] animate-slide-up`}>
                     {cardContent}
                   </div>
                 )}
               </>
             );
           })()}

           {/* Episode Panel */}
           <div className="flex flex-col min-h-0 max-h-[calc(85vh-88px)] rounded-2xl bg-white/5 border border-white/10 overflow-hidden">

           {/* Season Tabs */}
           {seasonBoundaries.length > 0 && (
             <div className="flex gap-1.5 overflow-x-auto custom-scrollbar px-3 pt-3 pb-2 border-b border-white/5 shrink-0">
               {seasonBoundaries.map((s, idx) => {
                 const isActive = idx === activeSeasonIdx;
                 return (
                   <button key={s.num}
                     onClick={() => setActiveSeasonIdx(idx)}
                     className={`flex items-center gap-1.5 px-4 py-2 rounded-xl shrink-0 text-[9px] font-black uppercase tracking-widest transition-all border ${
                       isActive
                         ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-[0_0_12px_rgba(37,99,235,0.2)]'
                         : 'bg-black/30 text-gray-500 border-transparent hover:bg-white/10 hover:text-gray-300'
                     }`}>
                     <span>{s.name || `Season ${s.num}`}</span>
                     <span className="text-[7px] opacity-50">({s.end - s.start})</span>
                   </button>
                 );
               })}
             </div>
           )}

           {/* Server Sub-Tabs */}
           {streamingLinks.length > 0 && (
             <div className="flex gap-1.5 overflow-x-auto custom-scrollbar px-3 pt-2 pb-2 border-b border-white/5 shrink-0">
               {streamingLinks.map((server: any, idx: number) => (
                 <button key={idx}
                   onClick={() => { setActiveServerIdx(idx); setActiveEpisodeIdx(currentSeason?.start || 0); }}
                   className={`flex items-center gap-2 px-4 py-2 rounded-xl shrink-0 text-[9px] font-black uppercase tracking-widest transition-all border ${
                     idx === activeServerIdx
                       ? 'bg-blue-600/20 text-blue-400 border-blue-500/50 shadow-[0_0_12px_rgba(37,99,235,0.2)]'
                       : 'bg-black/30 text-gray-500 border-transparent hover:bg-white/10 hover:text-gray-300'
                   }`}>
                   <Globe className="w-2.5 h-2.5 shrink-0" />
                   <span>{server.server_name}</span>
                 </button>
               ))}
             </div>
           )}

           {/* Episode Grid */}
           <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-2">
             {seasonBoundaries.length > 0 ? (() => {
               const seasonEpCount = currentSeason ? currentSeason.end - currentSeason.start : 0;
               const offsetStart = currentSeason?.start || 0;
               const serverData: any[] = streamingLinks?.[activeServerIdx]?.server_data ?? [];

               // Match by episode number (not position) — KKPhim may only return
               // current season's episodes, so offset-slicing breaks on season change.
               const extractNum = (name: string) => {
                 const m = name?.match(/\d+/);
                 return m ? parseInt(m[0]) : null;
               };
               const findEp = (epNum: number) =>
                 serverData.find(ep => extractNum(ep.name) === epNum) ?? null;

               const hasAnyStream = Array.from({ length: seasonEpCount }, (_, i) => findEp(i + 1))
                 .some(ep => ep?.m3u8 || ep?.embed || ep?.link_m3u8);

               return (
                 <div className="space-y-3">
                   {hasAnyStream && (
                     <div className="flex justify-end">
                       <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20 hover:scale-105 transition-all text-[8px] font-black uppercase tracking-widest">
                         <Activity className="w-3 h-3" /> Send All to JD
                       </button>
                     </div>
                   )}
                   <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                     {Array.from({ length: seasonEpCount }, (_, localIdx) => {
                       const epNum = localIdx + 1;
                       const globalIdx = offsetStart + localIdx;
                       const ep = findEp(epNum);
                       const hasLink = !!(ep?.m3u8 || ep?.embed || ep?.link_m3u8);
                       const epLabel = `Tập ${String(epNum).padStart(2, '0')}`;
                       const isPlaying = activeEpisodeIdx === globalIdx;

                       return (
                         <div key={globalIdx} className={`flex items-stretch rounded-xl border transition-all shadow-sm ${
                           !hasLink ? 'opacity-35 bg-black/20 border-white/5' : isPlaying ? 'bg-blue-600/20 border-blue-500/50 group/stream' : 'bg-black/40 border-white/10 hover:border-blue-500/40 hover:bg-black/60 group/stream'
                         }`}>
                           <button disabled={!hasLink}
                             onClick={() => { if (!hasLink) return; setActiveEpisodeIdx(globalIdx); if (!ep.embed) window.open(ep.m3u8 || ep.link_m3u8, '_blank'); }}
                             className="flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 transition-all rounded-l-xl overflow-hidden disabled:cursor-not-allowed hover:enabled:bg-blue-600/10">
                             {isPlaying && <Play className="w-2.5 h-2.5 text-blue-400 fill-blue-400 animate-pulse shrink-0" />}
                             <span className={`text-[10px] font-bold transition-colors truncate ${!hasLink ? 'text-gray-600' : isPlaying ? 'text-white' : 'text-gray-400 group-hover/stream:text-white'}`}>
                               {epLabel}
                             </span>
                           </button>
                           <div className="w-px bg-white/5 group-hover/stream:bg-blue-500/20 transition-colors" />
                           <button disabled={!hasLink} title={hasLink ? 'Send to JD' : 'No link'}
                             className="px-2.5 transition-all rounded-r-xl flex items-center justify-center group/dl shrink-0 disabled:cursor-not-allowed hover:enabled:bg-green-500/20">
                             <HardDrive className={`w-3 h-3 transition-colors ${hasLink ? 'text-gray-600 group-hover/dl:text-green-400' : 'text-gray-700'}`} />
                           </button>
                         </div>
                       );
                     })}
                   </div>
                 </div>
               );
             })() : (
               <div className="h-full flex flex-col items-center justify-center p-10 text-center gap-4">
                 <Globe className="w-10 h-10 text-gray-600 animate-pulse" />
                 <div className="space-y-1">
                   <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Đang tìm nguồn...</p>
                   <p className="text-[8px] font-bold text-gray-600 uppercase tracking-widest">DiscoveryPipeline đang xử lý</p>
                 </div>
               </div>
             )}
           </div>

           </div> {/* /Episode Panel */}
         </div>   {/* /Right column */}
      </div>

      {/* Sentinel — fixed mini player triggers when user scrolls past the top section */}
      <div ref={miniPlayerSentinelRef} className="h-0 w-0 pointer-events-none" />

      <div className="max-w-screen-2xl mx-auto px-4 md:px-10 flex flex-col gap-10 pt-4">
        <div className="flex flex-col xl:flex-row gap-8 w-full items-stretch">
          <section className="flex-1 glass-dark p-8 md:p-12 rounded-[3.5rem] border border-white/5 shadow-inner animate-cinema-fade">
            <div className="flex flex-col md:flex-row gap-10 items-start">
              <div className="hidden md:block w-48 shrink-0 aspect-[2/3] rounded-[2rem] overflow-hidden shadow-[0_20px_40px_-10px_rgba(0,0,0,0.8)] border border-white/10 group bg-[#050505]">
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
              <div className="glass-dark p-8 rounded-[3.5rem] border border-white/5 space-y-6 flex-1 bg-[#030303]/40">
                  <div className="flex items-center gap-3 border-b border-white/5 pb-4">
                      <Users className="w-4 h-4 text-blue-500/50" />
                      <h3 className="text-[9px] font-black uppercase tracking-[0.4em] text-gray-500">Personnel Manifest</h3>
                  </div>
                  <div className="space-y-4">
                      {(metadata.actor || []).slice(0, 5).map(a => (
                          <div key={a} className="flex items-center gap-4 group cursor-pointer transition-all">
                              <div className="w-9 h-9 rounded-[1rem] bg-white/5 border border-white/10 flex items-center justify-center text-[10px] font-black group-hover:bg-blue-600/30 group-hover:text-blue-200 transition-all duration-500 shadow-md">{a.charAt(0)}</div>
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
              onStreamingReady={(links) => {
                // quick-discovery trả flat list [{server, name, m3u8, embed}, ...]
                // episode panel cần grouped [{server_name, server_data: [...]}, ...]
                const isAlreadyGrouped = links.length > 0 && 'server_data' in links[0];
                if (isAlreadyGrouped) {
                  setStreamingLinks(links);
                  return;
                }
                // Group flat items by server field
                const grouped: Record<string, any> = {};
                for (const item of links) {
                  const key = item.server || item.server_name || 'Server';
                  if (!grouped[key]) grouped[key] = { server_name: key, server_data: [] };
                  grouped[key].server_data.push({
                    name: item.name,
                    m3u8: item.m3u8 || item.url || '',
                    embed: item.embed || '',
                  });
                }
                setStreamingLinks(Object.values(grouped));
              }}
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
