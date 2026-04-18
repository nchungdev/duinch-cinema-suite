import React, { useState } from 'react';
import { Loader2, ChevronDown, Box, File } from 'lucide-react';
import { api } from '../../../api/config';
import type { MediaLink } from '../../../api/config';
import { formatSize, formatDate, isKnownFile } from '../../../utils/formatters';
import { useCloudViewModel } from '../../view-models/CloudViewModel';
import { CloudButtons } from './CloudActions';
import type { CloudTarget } from '../../../services/cloudTargets';

interface DeepRowProps {
  link: MediaLink;
  actionLabel: string;
  color: string;
  onAction?: (url: string, name: string) => void;
  depth?: number;
  sourceBadge?: string | null;
}

export const DeepRow: React.FC<DeepRowProps> = ({ 
  link, actionLabel, color, onAction, depth = 0, sourceBadge 
}) => {
  const cloudTargets = useCloudViewModel();
  const [expanded, setExpanded] = useState(false);
  const [files, setFiles] = useState<MediaLink[] | null>(null);
  const [loadingFiles, setLoadingFiles] = useState(false);

  const isActuallyAFile = isKnownFile(link.name);
  const isFolder = !isActuallyAFile && (!!link.is_folder || !!link.url?.includes('/folder/') || !!link.url?.includes('/folders/'));
  
  const isExpandableMagnet = !!link.url?.startsWith('magnet:') && depth === 0;
  const canExpand = isFolder || isExpandableMagnet;

  const toggleFolder = async () => {
    if (!canExpand) return;
    if (expanded) { setExpanded(false); return; }
    setExpanded(true);
    if (files !== null) return;
    
    setLoadingFiles(true);
    try {
      let provider = 'fshare';
      if (link.url?.includes('fshare.vn')) provider = 'fshare';
      else if (link.url?.includes('drive.google.com')) provider = 'gdrive';
      else if (isExpandableMagnet) provider = 'torrent';

      const res = await api.get(`/media/expand-folder?url=${encodeURIComponent(link.url || '')}&provider=${provider}`);
      setFiles(res.data?.data?.results || []);
    } catch {
      setFiles([]);
    }
    setLoadingFiles(false);
  };

  const handleCloudAction = async (target: CloudTarget) => {
    if (!link.url) return;
    try {
        await api.post('/downloader/add', {
            url: link.url,
            name: link.name,
            target: target.id,
            provider: link.url.includes('fshare.vn') ? 'fshare' : 'direct'
        });
        alert(`Gửi lệnh tải tới ${target.label} thành công!`);
    } catch (err) {
        console.error('[DeepRow] Cloud action failed:', err);
        alert('Lỗi khi gửi lệnh tải!');
    }
  };

  return (
    <div className={`rounded-xl transition-all overflow-hidden ${depth === 0 ? 'bg-black/30 border border-white/5 hover:border-white/10' : 'border-l border-white/5 ml-4 my-1'}`}>
      <div className="flex items-center gap-3 px-3 py-2 group">
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            {!isFolder ? <File className="w-2.5 h-2.5 text-gray-600" /> : <Box className="w-2.5 h-2.5 text-blue-500" />}
            <p className="text-[9px] font-bold text-gray-300 truncate group-hover:text-white transition-colors" title={link.name}>
              {link.name || 'Unknown'}
            </p>
          </div>
          <div className="flex items-center gap-1.5 pl-4">
            {isFolder && (
              <span className="text-[7px] font-black text-blue-500/60 uppercase tracking-widest">Folder</span>
            )}
            {link.size != null && link.size > 0 && (
              <span className="text-[7px] font-bold text-gray-600 uppercase tracking-wider">{formatSize(link.size)}</span>
            )}
            {link.updated_at && (
              <span className="text-[7px] font-bold text-gray-700 uppercase tracking-wider">{formatDate(link.updated_at)}</span>
            )}
            {sourceBadge && depth === 0 && (
              <span className="text-[6px] font-black uppercase tracking-widest px-1 py-0.5 rounded bg-white/5 text-gray-600">
                {sourceBadge}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1.5 shrink-0">
          {canExpand && (
            <button onClick={toggleFolder}
              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-600 hover:text-gray-300 transition-all">
              {loadingFiles ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />}
            </button>
          )}

          {link.url ? (
            <CloudButtons 
              targets={cloudTargets}
              isFolder={isFolder}
              onDeviceAction={() => {
                if (isFolder) toggleFolder();
                else if (onAction) onAction(link.url!, link.name || '');
                else window.open(link.url!, '_blank');
              }}
              onCloudAction={handleCloudAction}
            />
          ) : (
            <span className={`text-[8px] font-black uppercase tracking-widest px-3 py-1.5 opacity-30 ${color}`}>File only</span>
          )}
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
                  actionLabel={actionLabel} 
                  color={color} 
                  onAction={onAction} 
                  depth={depth + 1} 
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
