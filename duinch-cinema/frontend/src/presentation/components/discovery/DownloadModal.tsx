import React, { useState } from 'react';
import { Download, Monitor, Globe, CheckCircle2, X, Info } from 'lucide-react';

interface DownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (choice: 'jdownloader' | 'browser', remember: boolean) => void;
    title: string;
    isHls?: boolean;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose, onConfirm, title, isHls }) => {
    const [remember, setRemember] = useState(false);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-cinema-fade">
            <div className="glass-dark border border-white/10 w-full max-w-md rounded-[2.5rem] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-8 border-b border-white/5 relative">
                    <button onClick={onClose} className="absolute top-6 right-6 text-gray-500 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-500/20 rounded-xl">
                            <Download className="w-5 h-5 text-blue-400" />
                        </div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight italic">Download Manager</h2>
                    </div>
                    <p className="text-gray-400 text-xs font-bold truncate pr-8">{title}</p>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6">
                    <div className="space-y-4">
                        <p className="text-[11px] font-black text-gray-500 uppercase tracking-[0.2em]">Chọn phương thức tải xuống:</p>
                        
                        {/* Option: JDownloader */}
                        <button 
                            onClick={() => onConfirm('jdownloader', remember)}
                            className="w-full flex items-center gap-4 p-5 bg-blue-600/10 border border-blue-500/30 rounded-2xl hover:bg-blue-600/20 hover:border-blue-500/50 transition-all group text-left"
                        >
                            <div className="p-3 bg-blue-500/20 rounded-xl group-hover:scale-110 transition-transform">
                                <Monitor className="w-6 h-6 text-blue-400" />
                            </div>
                            <div className="flex-1">
                                <span className="block text-sm font-black text-white uppercase italic">JDownloader (NAS)</span>
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Tải về Server / NAS cực nhanh & ổn định</span>
                            </div>
                            <CheckCircle2 className="w-5 h-5 text-blue-500" />
                        </button>

                        {/* Option: Browser */}
                        <button 
                            onClick={() => onConfirm('browser', remember)}
                            className="w-full flex items-center gap-4 p-5 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-white/20 transition-all group text-left"
                        >
                            <div className="p-3 bg-gray-500/20 rounded-xl group-hover:scale-110 transition-transform">
                                <Globe className="w-6 h-6 text-gray-400" />
                            </div>
                            <div className="flex-1">
                                <span className="block text-sm font-black text-gray-300 uppercase italic">Trình duyệt (Local)</span>
                                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Tải trực tiếp về thiết bị hiện tại</span>
                            </div>
                        </button>
                    </div>

                    {isHls && (
                        <div className="p-4 bg-orange-500/10 border border-orange-500/20 rounded-2xl flex gap-3">
                            <Info className="w-4 h-4 text-orange-500 shrink-0" />
                            <p className="text-[10px] text-orange-400 font-bold leading-relaxed uppercase tracking-tighter">
                                <span className="text-white">Lưu ý HLS:</span> JDownloader sẽ tự động convert sang file MP4 chuẩn. Tải trình duyệt sẽ cần công cụ xử lý segment.
                            </p>
                        </div>
                    )}

                    {/* Remember Checkbox */}
                    <label className="flex items-center gap-3 cursor-pointer group">
                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${remember ? 'bg-blue-600 border-blue-400' : 'bg-white/5 border-white/10 group-hover:border-white/20'}`}>
                            <input 
                                type="checkbox" 
                                className="hidden" 
                                checked={remember}
                                onChange={() => setRemember(!remember)}
                            />
                            {remember && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest group-hover:text-gray-300 transition-colors">
                            Ghi nhớ lựa chọn của tôi
                        </span>
                    </label>
                </div>
            </div>
        </div>
    );
};
