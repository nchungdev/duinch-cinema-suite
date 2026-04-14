import { useState, useEffect } from 'react';
import { ChevronLeft, Play, CloudDownload, Database } from 'lucide-react';
import { api } from '../api/config';
import type { DetailResponse, MediaLink } from '../api/config';
import { DiscoveryPipeline } from './DiscoveryPipeline';
import { startDownload } from '../services/DownloadService';

interface MovieDetailProps {
  slug: string;
  onBack: () => void;
}

export const MovieDetail: React.FC<MovieDetailProps> = ({ slug, onBack }) => {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [discoveredLinks, setDiscoveredLinks] = useState<MediaLink[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const res = await api.get<DetailResponse>(`/metadata/${slug}`);
        setData(res.data);
      } catch (err) {
        console.error('Fetch detail failed:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [slug]);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-60 space-y-8 animate-pulse">
        <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
        <div className="text-center space-y-2">
          <p className="text-[10px] font-black text-blue-500 uppercase tracking-[0.4em]">Establishing Uplink</p>
          <p className="text-[8px] font-black text-gray-600 uppercase tracking-widest">Hydrating Media Metadata...</p>
        </div>
      </div>
    );
  }

  const { metadata, local } = data;

  return (
    <div className="animate-cinema-fade space-y-12">
      {/* Back Button */}
      <button 
        onClick={onBack}
        className="group flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-white transition-all"
      >
        <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" /> Back to Discovery
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Column 1: Metadata Card */}
        <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-6">
          <div className="glass-card p-6 space-y-6 overflow-hidden">
            <div className="flex gap-6 items-center">
              <img 
                src={metadata.poster} 
                className="w-32 rounded-2xl shadow-2xl aspect-[2/3] object-cover"
                alt={metadata.title}
              />
              <div className="flex-1 space-y-3">
                <h2 className="text-3xl font-black italic tracking-tighter uppercase leading-[0.9]">{metadata.title}</h2>
                <div className="flex items-center gap-3">
                  <span className="text-blue-500 font-black text-[9px] tracking-widest uppercase">{metadata.year}</span>
                  <span className="w-1 h-1 bg-white/20 rounded-full"></span>
                  <span className="text-gray-500 font-black text-[9px] tracking-widest uppercase">{metadata.media_type}</span>
                </div>
              </div>
            </div>
            
            <div className="pt-6 border-t border-white/5">
              <p className="text-gray-400 text-xs leading-relaxed opacity-80">{metadata.overview}</p>
            </div>

            {local.exists && (
              <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-2xl flex items-center gap-3">
                <Database className="w-4 h-4 text-green-500" />
                <div className="flex-1 overflow-hidden">
                  <p className="text-[8px] font-black text-green-500 uppercase">Available Locally</p>
                  <p className="text-[7px] text-green-500/50 truncate tracking-tight">{local.path}</p>
                </div>
              </div>
            )}
          </div>

          <DiscoveryPipeline 
            slug={slug} 
            title={metadata.title} 
            onLinksFound={(links) => setDiscoveredLinks(prev => [...prev, ...links])} 
          />
        </div>

        {/* Column 2: Sources & Actions */}
        <div className="lg:col-span-8 space-y-10">
          {/* Streaming Sources */}
          {data.links.streaming.map((server, sIdx) => (
            <div key={sIdx} className="glass-card p-8 space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></div>
                <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">
                  {metadata.media_type === 'tv' ? 'Episodes' : 'Movie'} • {server.server_name}
                </h3>
              </div>
              
              <div className="flex flex-wrap gap-2.5">
                {server.server_data.map((ep, eIdx) => (
                  <div key={eIdx} className="group relative flex flex-col items-center justify-center p-2.5 px-4 rounded-2xl bg-white/5 border border-white/5 hover:border-blue-500/30 transition-all h-10 w-fit">
                    <span className="font-black text-[10px] italic">{ep.name.replace('Tập ', '')}</span>
                    
                    {/* Bead Actions Menu (Hidden by default, shown on focus/hover) */}
                    <div className="absolute inset-x-0 -bottom-10 opacity-0 group-hover:opacity-100 transition-all flex justify-center gap-1 z-20 pointer-events-none group-hover:pointer-events-auto">
                      <button className="w-8 h-8 rounded-lg bg-blue-600 text-white shadow-lg flex items-center justify-center"><Play className="w-3 h-3 fill-white" /></button>
                      <button 
                        onClick={() => startDownload({ name: `${metadata.title} - ${ep.name}`, url: ep.m3u8, source: 'Streaming' }, metadata)}
                        className="w-8 h-8 rounded-lg bg-white text-black shadow-lg flex items-center justify-center"
                      >
                        <CloudDownload className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Discovery Results */}
          {(data.links.fshare.length > 0 || discoveredLinks.length > 0) && (
            <div className="glass-card p-8 relative overflow-hidden">
               <div className="absolute -top-24 -right-24 w-48 h-48 bg-purple-500/10 blur-[80px] rounded-full"></div>
               <div className="flex items-center gap-3 mb-8">
                  <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_10px_rgba(168,85,247,0.5)]"></div>
                  <h3 className="text-[10px] font-black text-white uppercase tracking-[0.2em]">External Discovery</h3>
               </div>

               <div className="space-y-1">
                  {[...data.links.fshare, ...discoveredLinks].map((link, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-white/[0.02] border-t border-white/5 hover:bg-white/5 transition-all group rounded-xl">
                      <div>
                        <p className="font-black italic text-[10px] text-gray-100 group-hover:text-blue-400 transition-colors uppercase tracking-tight">{link.name}</p>
                        <p className="text-[7px] font-black text-purple-400 uppercase tracking-widest opacity-60 mt-0.5">{link.source || 'Fshare Premium'}</p>
                      </div>
                      <div className="flex gap-2">
                         <button 
                          onClick={() => startDownload(link, metadata)}
                          className="px-3 py-1.5 rounded-lg bg-purple-600/20 text-purple-400 hover:bg-purple-600 hover:text-white transition-all text-[8px] font-black uppercase tracking-widest"
                         >
                            Gửi JDownloader
                         </button>
                      </div>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
