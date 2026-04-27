import React from 'react';
import { X, Video, Download, ShieldCheck } from 'lucide-react';

interface HlsDownloaderModalProps {
    isOpen: boolean;
    url: string;
    name: string;
    onClose: () => void;
}

export const HlsDownloaderModal: React.FC<HlsDownloaderModalProps> = ({ isOpen, url, name, onClose }) => {
    if (!isOpen) return null;

    // Direct Backend Filtered Download URL
    const backendDownloadUrl = `http://localhost:8086/api/media/download-m3u8?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(name.replace(/\s+/g, '_'))}.mp4`;

    const handleBackendDownload = () => {
        window.location.assign(backendDownloadUrl);
    };

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-cinema-fade">
            <div className="glass-dark border border-white/10 w-full max-w-4xl h-[60vh] flex flex-col rounded-[2.5rem] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/20 rounded-xl">
                            <Video className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight italic">M3U8 Downloader Pro</h2>
                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">{name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 flex flex-col items-center justify-center p-8 bg-black/20 text-center">
                    <div className="mb-8 p-6 bg-white/5 rounded-[2rem] border border-white/5 max-w-lg">
                        <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
                        <h3 className="text-xl font-bold text-white mb-2">Clean Download Enabled</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">
                            Hệ thống đã tự động kích hoạt bộ lọc quảng cáo. 
                            Video sẽ được tải trực tiếp từ server nguồn thông qua Backend Proxy để đảm bảo tốc độ và không có virus.
                        </p>
                    </div>

                    <button 
                        onClick={handleBackendDownload}
                        className="group relative px-12 py-5 bg-gradient-to-r from-orange-600 to-red-600 rounded-2xl font-black text-white uppercase tracking-tighter hover:scale-105 active:scale-95 transition-all shadow-xl shadow-orange-900/20 flex items-center gap-3"
                    >
                        <Download className="w-6 h-6 group-hover:bounce" />
                        Download Now (No Ads)
                    </button>
                    
                    <p className="mt-6 text-gray-500 text-[10px] uppercase font-bold tracking-widest">
                        * Tải về dưới định dạng MP4 chất lượng cao nhất
                    </p>
                </div>
            </div>
        </div>
    );
};
