import React from 'react';
import { HardDrive, Cloud, Server, Box, Globe } from 'lucide-react';
import type { CloudTarget } from '../../../services/cloudTargets';

interface CloudActionsProps {
  targets: CloudTarget[];
  count?: number;
  compact?: boolean;
  onDeviceAction?: () => void;
  onCloudAction?: (target: CloudTarget) => void;
  isFolder?: boolean;
  isCloudDisabled?: boolean;
}

export const CloudIcon: React.FC<{ icon: string; cls?: string }> = ({ icon, cls }) => {
  const c = cls ?? 'w-3.5 h-3.5';
  if (icon === 'server')     return <Server    className={c} />;
  if (icon === 'hard-drive') return <HardDrive className={c} />;
  if (icon === 'box')        return <Box       className={c} />;
  if (icon === 'globe')      return <Globe     className={c} />;
  return <Cloud className={c} />;
};

export const CloudButtons: React.FC<CloudActionsProps> = ({ 
  targets, count, compact = false, onDeviceAction, onCloudAction, isFolder, isCloudDisabled = false
}) => {
  const label = (t: CloudTarget) => (count ? `${t.label} (${count})` : t.label);
  const px    = compact ? 'px-2 py-1' : 'px-4 py-2';

  return (
    <div className="flex items-center gap-2">
      {/* Device Button */}
      <button 
        title="Download to Browser"
        onClick={(e) => { e.stopPropagation(); onDeviceAction?.(); }}
        className={`flex items-center justify-center gap-2 ${px} rounded-xl bg-white/5 text-gray-400 border border-white/10 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all text-[9px] font-black uppercase tracking-widest active:scale-95`}
      >
        <HardDrive className="w-3.5 h-3.5" />
        {!compact && (count ? `Local (${count})` : (isFolder ? 'Open' : 'Local'))}
      </button>

      {/* Cloud Buttons */}
      {targets.length === 0 ? (
        <button 
          title={isCloudDisabled ? "JDownloader Offline" : "Send to Cloud Node"}
          disabled={isCloudDisabled}
          className={`flex items-center justify-center gap-2 ${px} rounded-xl border transition-all text-[9px] font-black uppercase tracking-widest active:scale-95 ${
            isCloudDisabled 
            ? 'bg-white/2 text-gray-700 border-white/5 cursor-not-allowed opacity-50' 
            : 'bg-blue-600/10 text-blue-400 border-blue-500/30 hover:bg-blue-600/20 shadow-[0_0_15px_rgba(37,99,235,0.1)]'
          }`}
        >
          <Cloud className={`w-3.5 h-3.5 ${isCloudDisabled ? 'text-gray-800' : 'text-blue-500 animate-pulse'}`} />
          {!compact && (count ? `Cloud (${count})` : 'Cloud')}
        </button>
      ) : (
        targets.map(t => (
          <button key={t.id} title={isCloudDisabled ? "JDownloader Offline" : `Send to ${t.label}`}
            disabled={isCloudDisabled}
            onClick={(e) => { e.stopPropagation(); onCloudAction?.(t); }}
            className={`flex items-center justify-center gap-2 ${px} rounded-xl border transition-all text-[9px] font-black uppercase tracking-widest active:scale-95 ${
                isCloudDisabled 
                ? 'bg-white/2 border-white/5 text-gray-700 cursor-not-allowed opacity-50' 
                : `${t.bgColor} ${t.color} shadow-[0_0_15px_rgba(37,99,235,0.1)] hover:shadow-[0_0_20px_rgba(37,99,235,0.25)] border-blue-500/20`
            }`}>
            <div className="relative">
                <CloudIcon icon={t.icon} />
                {!isCloudDisabled && (
                    <span className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                )}
            </div>
            {!compact && label(t)}
          </button>
        ))
      )}
    </div>
  );
};
