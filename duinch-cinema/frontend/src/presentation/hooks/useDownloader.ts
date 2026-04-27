import { useState, useCallback } from 'react';
import { api } from '../api/config';

export type DownloadPreference = 'jdownloader' | 'browser' | null;

export const useDownloader = () => {
    const [isChecking, setIsChecking] = useState(false);

    const getPreference = useCallback((): DownloadPreference => {
        return localStorage.getItem('duinch_download_pref') as DownloadPreference;
    }, []);

    const setPreference = useCallback((pref: DownloadPreference, remember: boolean) => {
        if (remember && pref) {
            localStorage.setItem('duinch_download_pref', pref);
        }
    }, []);

    const checkJDStatus = async () => {
        setIsChecking(true);
        try {
            const res = await api.get('/downloader/health');
            setIsChecking(false);
            return res.data?.status === 'healthy';
        } catch {
            setIsChecking(false);
            return false;
        }
    };

    const sendToJD = async (url: string, name: string, path?: string) => {
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

    const downloadInBrowser = (url: string, name: string) => {
        if (url.includes('.m3u8') || url.includes('.index')) {
            // Specialized HLS Download Logic
            const hlsToolUrl = `https://blog.v-3.cc/m3u8-downloader.html?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name)}`;
            window.open(hlsToolUrl, '_blank');
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
        checkJDStatus,
        getPreference,
        setPreference,
        sendToJD,
        downloadInBrowser
    };
};
