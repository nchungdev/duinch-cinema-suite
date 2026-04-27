import React from 'react';
import { X, Video } from 'lucide-react';

interface HlsDownloaderModalProps {
    isOpen: boolean;
    url: string;
    name: string;
    onClose: () => void;
}

export const HlsDownloaderModal: React.FC<HlsDownloaderModalProps> = ({ isOpen, url, name, onClose }) => {
    if (!isOpen) return null;

    const toolUrl = `https://blog.v-3.cc/m3u8-downloader.html?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;

    return (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-cinema-fade">
            <div className="glass-dark border border-white/10 w-full max-w-4xl h-[85vh] flex flex-col rounded-[2.5rem] overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="p-6 border-b border-white/5 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-orange-500/20 rounded-xl">
                            <Video className="w-5 h-5 text-orange-400" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black text-white uppercase tracking-tight italic">HLS Local Downloader</h2>
                            <p className="text-gray-400 text-[10px] font-bold uppercase tracking-widest">{name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-500 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Content - Iframe */}
                <div className="flex-1 w-full bg-black/50 relative">
                    <iframe 
                        src={toolUrl}
                        className="absolute inset-0 w-full h-full border-0"
                        title="HLS Downloader"
                        sandbox="allow-scripts allow-same-origin allow-downloads allow-forms allow-popups"
                    />
                </div>
            </div>
        </div>
    );
};
