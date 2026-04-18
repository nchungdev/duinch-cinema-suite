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
}

export const CloudIcon: React.FC<{ icon: string; cls?: string }> = ({ icon, cls }) => {
  const c = cls ?? 'w-2.5 h-2.5';
  if (icon === 'server')     return <Server    className={c} />;
  if (icon === 'hard-drive') return <HardDrive className={c} />;
  if (icon === 'box')        return <Box       className={c} />;
  if (icon === 'globe')      return <Globe     className={c} />;
  return <Cloud className={c} />;
};

export const CloudButtons: React.FC<CloudActionsProps> = ({ 
  targets, count, compact = false, onDeviceAction, onCloudAction, isFolder 
}) => {
  const label = (t: CloudTarget) => (count ? `${t.label} (${count})` : t.label);
  const px    = compact ? 'px-2 py-1' : 'px-3 py-1.5';

  return (
    <div className="flex items-center gap-1.5">
      {/* Device Button */}
      <button 
        onClick={(e) => { e.stopPropagation(); onDeviceAction?.(); }}
        className={`flex items-center gap-1.5 ${px} rounded-lg bg-white/8 text-gray-300 border border-white/10 hover:bg-white/15 transition-all text-[8px] font-black uppercase tracking-widest`}
      >
        <HardDrive className="w-2.5 h-2.5" />
        {!compact && (count ? `Device (${count})` : (isFolder ? 'Open' : 'Device'))}
      </button>

      {/* Cloud Buttons */}
      {targets.length === 0 ? (
        <button title="Send to cloud"
          className={`flex items-center gap-1.5 ${px} rounded-lg bg-white/5 text-gray-500 border border-white/10 hover:bg-white/10 hover:text-gray-300 transition-all text-[8px] font-black uppercase tracking-widest`}>
          <Cloud className="w-2.5 h-2.5" />
          {!compact && (count ? `Cloud (${count})` : 'Cloud')}
        </button>
      ) : (
        targets.map(t => (
          <button key={t.id} title={`Send to ${t.label}`}
            onClick={(e) => { e.stopPropagation(); onCloudAction?.(t); }}
            className={`flex items-center gap-1.5 ${px} rounded-lg border transition-all text-[8px] font-black uppercase tracking-widest ${t.bgColor} ${t.color}`}>
            <CloudIcon icon={t.icon} />
            {!compact && label(t)}
          </button>
        ))
      )}
    </div>
  );
};
