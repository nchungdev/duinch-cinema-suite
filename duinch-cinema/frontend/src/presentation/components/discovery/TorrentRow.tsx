import React, { useState } from 'react';
import { Loader2, ChevronDown, Users, Box, File, HardDrive, Cloud } from 'lucide-react';
import { api } from '../../../api/config';
import { formatSize } from '../../../utils/formatters';
import { useCloudViewModel } from '../../view-models/CloudViewModel';
import { CloudButtons } from './CloudActions';
import type { CloudTarget } from '../../../services/cloudTargets';

interface TorrentLink {
  url: string; 
  name: string; 
  size?: number; 
  seeders?: number; 
  leechers?: number;
  quality?: string; 
  num_files?: number; 
  info_hash?: string; 
  source?: string;
}

const SeederBadge: React.FC<{ count: number }> = ({ count }) => {
  const color = count >= 50 ? 'text-green-400' : count >= 10 ? 'text-yellow-400' : 'text-red-400';
  return (
    <span className={`flex items-center gap-1 text-[7px] font-black uppercase tracking-wider ${color}`}>
      <Users className="w-2.5 h-2.5" />
      {count}
    </span>
  );
};

const QualityBadge: React.FC<{ quality: string }> = ({ quality }) => {
  const color =
    quality === '4K' || quality === 'Remux' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
    quality === '1080p' ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' :
    quality === '720p'  ? 'bg-green-500/20 text-green-300 border-green-500/30' :
    quality === 'CAM'   ? 'bg-red-500/20 text-red-300 border-red-500/30' :
    'bg-white/5 text-gray-400 border-white/10';
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[7px] font-black uppercase tracking-wider ${color}`}>
      {quality}
    </span>
  );
};

export const TorrentRow: React.FC<{ 
  link: TorrentLink; 
  sourceBadge?: string | null;
  onBrowserDownload?: (url: string, name: string) => void;
  onCloudDownload?: (url: string, name: string) => void;
  isJdOnline?: boolean;
}> = ({ link, sourceBadge, onBrowserDownload, onCloudDownload, isJdOnline = false }) => {
  const cloudTargets = useCloudViewModel();
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<any[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const isMagnet = !!link.url?.startsWith('magnet:');
  const canExpand = isMagnet || (link.num_files ?? 0) > 1 || !!link.info_hash;

  const toggleFiles = async () => {
    if (!canExpand) return;
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (files !== null) return;
    
    setLoadingFiles(true);
    try {
      const res = await api.get(`/media/expand-folder?url=${encodeURIComponent(link.url || link.info_hash || '')}&provider=torrent`);
      setFiles(res.data?.results || []);
    } catch { 
      setFiles([]); 
    }
    setLoadingFiles(false);
  };

  const handleCloudAction = async (_target: CloudTarget) => {
    if (onCloudDownload && link.url) {
        onCloudDownload(link.url, link.name);
    }
  };

  return (
    <div className="rounded-xl bg-black/30 border border-white/5 hover:border-white/10 transition-all overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 group">
        <div onClick={toggleFiles} className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer group/header">
          <div className={`w-10 h-10 flex items-center justify-center rounded-2xl transition-all border ${
            expanded 
              ? 'bg-blue-600 border-blue-500 shadow-[0_0_20px_rgba(37,99,235,0.4)] text-white' 
              : 'bg-white/5 border-white/10 text-gray-400 group-hover/header:bg-white/10 group-hover/header:text-blue-400'
          }`}>
            <Box className={`w-5 h-5 ${expanded ? 'animate-pulse' : ''}`} />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-[10px] font-black uppercase tracking-widest text-white truncate" title={link.name}>
              {link.name}
            </span>
            <div className="flex items-center gap-2 flex-wrap">
              {link.quality && <QualityBadge quality={link.quality} />}
              {link.size != null && link.size > 0 && (
                <span className="text-[7px] font-bold text-gray-500 uppercase tracking-wider">{formatSize(link.size)}</span>
              )}
              {link.seeders != null && <SeederBadge count={link.seeders} />}
              {sourceBadge && (
                <span className="text-[7px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded bg-blue-600/20 text-blue-400 border border-blue-500/20">
                  {sourceBadge}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {canExpand && (
            <button onClick={toggleFiles}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-all">
              {loadingFiles ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />}
            </button>
          )}
          
          <CloudButtons 
            targets={cloudTargets}
            isCloudDisabled={!isJdOnline}
            onDeviceAction={() => onBrowserDownload?.(link.url, link.name)}
            onCloudAction={handleCloudAction}
          />
        </div>
      </div>

      {expanded && (
        <div className="border-t border-white/5 px-1 py-1 bg-white/[0.02] animate-cinema-fade">
          {loadingFiles ? (
            <div className="flex items-center gap-2 px-4 py-3 text-[8px] font-black uppercase tracking-widest text-gray-600">
              <Loader2 className="w-3 h-3 animate-spin text-blue-500/50" />Exploring transmission grid…
            </div>
          ) : files && files.length > 0 ? (
            <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-white/[0.04]">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 group/file hover:bg-white/[0.03] transition-colors">
                  {/* Icon */}
                  <File className="w-3.5 h-3.5 text-gray-600 shrink-0" />

                  {/* Name + size */}
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="text-[9px] font-bold text-gray-300 truncate" title={f.name}>{f.name}</span>
                    {f.size > 0 && (
                      <span className="text-[7px] text-gray-600 font-bold">{formatSize(f.size)}</span>
                    )}
                  </div>

                  {/* Download buttons — gửi magnet cả torrent, JD tự pick file */}
                  <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover/file:opacity-100 transition-opacity">
                    <button
                      onClick={() => onBrowserDownload?.(f.magnet || link.url, f.name)}
                      title="Tải về máy (JD / browser)"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-blue-600/20 hover:border-blue-500/40 hover:text-blue-400 transition-all text-[8px] font-black uppercase tracking-widest"
                    >
                      <HardDrive className="w-3 h-3" />
                      Local
                    </button>
                    <button
                      onClick={() => onCloudDownload?.(f.magnet || link.url, f.name)}
                      disabled={!isJdOnline}
                      title="Gửi lên cloud"
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-gray-400 hover:bg-purple-600/20 hover:border-purple-500/40 hover:text-purple-400 transition-all text-[8px] font-black uppercase tracking-widest disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Cloud className="w-3 h-3" />
                      Cloud
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[8px] text-gray-600 uppercase tracking-widest py-3 px-4 italic">No transmissions found in this node</p>
          )}
        </div>
      )}
    </div>
  );
};
