import React, { useState } from 'react';
import { Loader2, ChevronDown, Box, File } from 'lucide-react';
import { api } from '@shared/api/config';
import type { MediaLink } from '@shared/api/config';
import { formatSize, formatDate, isKnownFile } from '@shared/utils/formatters';
import { useCloudViewModel } from '../../view-models/CloudViewModel';
import { CloudButtons } from './CloudActions';
import type { CloudTarget } from '@shared/services/cloudTargets';

interface DeepRowProps {
  link: MediaLink;
  actionLabel: string;
  color: string;
  onBrowserAction?: (url: string, name: string) => void;
  onCloudAction?: (url: string, name: string) => void;
  depth?: number;
  sourceBadge?: string | null;
  isJdOnline?: boolean;
}

export const DeepRow: React.FC<DeepRowProps> = ({ 
  link, actionLabel, color, onBrowserAction, onCloudAction, depth = 0, sourceBadge, isJdOnline = false 
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
      setFiles(res.data?.results || []);
    } catch {
      setFiles([]);
    }
    setLoadingFiles(false);
  };

  const handleCloudAction = async (_target: CloudTarget) => {
    if (onCloudAction && link.url) {
        onCloudAction(link.url, link.name || '');
    }
  };

  return (
    <div className={`rounded-xl transition-all overflow-hidden ${depth === 0 ? 'bg-black/30 border border-white/5 hover:border-white/10' : 'border-l border-white/5 ml-4 my-1'}`}>
      <div className="flex items-center gap-3 px-3 py-2 group">
        <div 
          onClick={() => canExpand && toggleFolder()} 
          className={`flex items-center gap-3 min-w-0 flex-1 cursor-pointer group/header ${depth > 0 ? 'py-1.5' : ''}`}
        >
          <div className={`flex items-center justify-center transition-all border shrink-0 ${
            depth === 0 ? 'w-10 h-10 rounded-2xl' : 'w-7 h-7 rounded-lg'
          } ${
            expanded 
              ? 'bg-blue-600 border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)] text-white' 
              : 'bg-white/5 border-white/10 text-gray-400 group-hover/header:bg-white/10 group-hover/header:text-blue-400'
          }`}>
            {isFolder ? (
              <Box className={depth === 0 ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
            ) : (
              <File className={depth === 0 ? 'w-5 h-5' : 'w-3.5 h-3.5'} />
            )}
          </div>
          <div className="flex flex-col min-w-0">
            <span className={`font-black uppercase tracking-widest truncate ${depth === 0 ? 'text-[10px] text-white' : 'text-[9px] text-gray-300'}`} title={link.name}>
              {link.name || 'Unknown'}
            </span>
            <div className="flex items-center gap-2">
              {link.size != null && link.size > 0 && (
                <span className="text-[7px] font-bold text-gray-600 uppercase tracking-wider">{formatSize(link.size)}</span>
              )}
              {isFolder && (
                <span className="text-[7px] font-black text-blue-500/60 uppercase tracking-widest">Directory Node</span>
              )}
            </div>
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
              isCloudDisabled={!isJdOnline}
              onDeviceAction={() => {
                if (isFolder) toggleFolder();
                else if (onBrowserAction) onBrowserAction(link.url!, link.name || '');
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
                  onBrowserAction={onBrowserAction}
                  onCloudAction={onCloudAction}
                  isJdOnline={isJdOnline}
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
