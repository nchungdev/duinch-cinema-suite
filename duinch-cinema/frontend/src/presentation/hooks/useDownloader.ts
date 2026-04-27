import { useState, useCallback } from 'react';
import { api } from '../../api/config';

export type DownloadPreference = 'jdownloader' | 'browser' | null;

export const useDownloader = () => {
    const [isChecking, setIsChecking] = useState(false);

    const getPreference = useCallback((): DownloadPreference => {
        return localStorage.getItem('duinch_download_pref_v2') as DownloadPreference;
    }, []);

    const setPreference = useCallback((pref: DownloadPreference, remember: boolean) => {
        if (remember && pref) {
            localStorage.setItem('duinch_download_pref_v2', pref);
        }
    }, []);

    const checkJDStatus = async () => {
        setIsChecking(true);
        try {
            const res = await api.get('/downloader/health');
            const isHealthy = res.data?.status === 'healthy';
            console.log('[Downloader] JD Health Status:', res.data?.status, '-> Healthy:', isHealthy);
            setIsChecking(false);
            return isHealthy;
        } catch (err) {
            console.error('[Downloader] Health check failed:', err);
            setIsChecking(false);
            return false;
        }
    };

    const sendToJD = async (url: string, name: string, path?: string) => {
        console.log('[Downloader] Sending to JD:', { url, name, path });
        try {
            await api.post('/downloader/add', {
                url,
                name,
                package_name: name,
                folder: path
            });
            return true;
        } catch (err) {
            console.error('[Downloader] Failed to send to JD:', err);
            return false;
        }
    };

    const [hlsToolData, setHlsToolData] = useState<{url: string; name: string} | null>(null);

    const downloadInBrowser = (url: string, name: string) => {
        console.log('[Downloader] Downloading in browser:', { url, name });
        if (url.includes('.m3u8') || url.includes('.index')) {
            // Utilize the native backend FFmpeg proxy to download and mux M3U8 on the fly
            const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:8086/api';
            const downloadUrl = `${backendUrl}/downloader/proxy-download-hls?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
            
            // Create an invisible link to trigger the browser's native download dialog
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = `${name}.mp4`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } else {
            const link = document.createElement('a');
            link.href = url;
            link.download = name;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }
    };

    return {
        isChecking,
        hlsToolData,
        setHlsToolData,
        checkJDStatus,
        getPreference,
        setPreference,
        sendToJD,
        downloadInBrowser
    };
};
