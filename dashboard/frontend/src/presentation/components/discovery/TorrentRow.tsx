import React, { useState } from 'react';
import { Loader2, ChevronDown, Users, File } from 'lucide-react';
import { api } from '../../../api/config';
import { formatSize } from '../../../utils/formatters';
import { RankingService } from '../../../domain/services/RankingService';
import { DeepRow } from './DeepRow';
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

const SpeedBar: React.FC<{ seeders: number }> = ({ seeders }) => {
  const bars = RankingService.getSeederBars(seeders);
  const color = bars >= 4 ? 'bg-green-400' : bars >= 3 ? 'bg-blue-400' : bars >= 2 ? 'bg-yellow-400' : 'bg-red-400';
  const textColor = bars >= 4 ? 'text-green-400' : bars >= 3 ? 'text-blue-400' : bars >= 2 ? 'text-yellow-400' : 'text-red-400';
  
  return (
    <span className={`flex items-center gap-1.5 text-[7px] font-black uppercase tracking-wider ${textColor}`}>
      <span className="flex items-end gap-px h-3">
        {[1,2,3,4,5].map(b => (
          <span key={b} className={`w-1 rounded-sm transition-all ${b <= bars ? color : 'bg-white/10'}`}
            style={{ height: `${4 + b * 2}px` }} />
        ))}
      </span>
      {RankingService.estimateTorrentSpeed(seeders)}
    </span>
  );
};

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

export const TorrentRow: React.FC<{ link: TorrentLink; sourceBadge?: string | null; compact?: boolean }> = ({ link, sourceBadge, compact }) => {
  const cloudTargets = useCloudViewModel();
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<any[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const canExpand = (link.num_files ?? 0) > 1 || !!link.info_hash;

  const toggleFiles = async () => {
    if (!canExpand) return;
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (files !== null) return;
    
    setLoadingFiles(true);
    try {
      const res = await api.get(`/media/expand-folder?url=${encodeURIComponent(link.url || link.info_hash || '')}&provider=torrent`);
      setFiles(res.data?.data?.results || []);
    } catch { 
      setFiles([]); 
    }
    setLoadingFiles(false);
  };

  const handleCloudAction = async (target: CloudTarget) => {
    try {
        await api.post('/downloader/add', {
            url: link.url,
            name: link.name,
            target: target.id,
            provider: 'torrent'
        });
        alert(`Gửi Torrent tới ${target.label} thành công!`);
    } catch (err) {
        console.error('[TorrentRow] Cloud action failed:', err);
        alert('Lỗi khi gửi Torrent!');
    }
  };

  return (
    <div className="rounded-xl bg-black/30 border border-white/5 hover:border-white/10 transition-all overflow-hidden">
      <div className="flex items-center gap-3 px-3 py-2.5 group">
        <div className="flex-1 min-w-0 space-y-1.5">
          <p className="text-[9px] font-bold text-gray-300 truncate group-hover:text-white transition-colors" title={link.name}>
            {link.name}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            {link.quality && <QualityBadge quality={link.quality} />}
            {link.size != null && link.size > 0 && (
              <span className="text-[7px] font-bold text-gray-500 uppercase tracking-wider">{formatSize(link.size)}</span>
            )}
            {link.seeders != null && (
              <>
                <SeederBadge count={link.seeders} />
                <SpeedBar seeders={link.seeders} />
              </>
            )}
            {link.leechers != null && (
              <span className="flex items-center gap-1 text-[7px] font-bold text-gray-600 uppercase tracking-wider">
                <Users className="w-2.5 h-2.5" />{link.leechers}↓
              </span>
            )}
            {sourceBadge && (
              <span className="text-[6px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-white/5 text-gray-600">{sourceBadge}</span>
            )}
            {canExpand && (
              <span className="flex items-center gap-1 text-[7px] font-bold text-gray-500 uppercase tracking-wider">
                <File className="w-2.5 h-2.5" />{link.num_files} files
              </span>
            )}
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
            compact={compact}
            onDeviceAction={() => window.open(link.url, '_blank')}
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
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {files.map((f, i) => (
                <DeepRow 
                  key={i} 
                  link={f} 
                  actionLabel="Watch" 
                  color="text-green-400" 
                  onAction={() => {}} 
                  depth={1} 
                  compact={compact}
                />
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
