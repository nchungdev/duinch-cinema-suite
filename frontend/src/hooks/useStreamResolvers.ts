import { useState } from 'react';
import { api } from '../api/config';
import { useMovieDetail } from '../components/detail/MovieDetailContext';

export const useStreamResolvers = () => {
  const { 
    setActiveEmbed, setActiveServerIdx, setActiveEpisodeIdx, 
    setIsTorrentStreaming, setIsFshareResolving,
    setUserSettings 
  } = useMovieDetail();

  const handleTorrentStream = async (magnet: string, serverName: string, epIdx: number, srvIdx: number) => {
    setIsTorrentStreaming(true);
    try {
        const res = await api.get<any>(`/stream/torrent?magnet=${encodeURIComponent(magnet)}`);
        if (res.data?.stream_url) {
            const stream_url = res.data.stream_url;
            setActiveServerIdx(srvIdx);
            setActiveEpisodeIdx(epIdx);
            setActiveEmbed(stream_url); 
            localStorage.setItem('omv_active_server_name', serverName);
        } else {
            throw new Error(res.data?.detail || 'Backend failed to initialize stream');
        }
    } catch (err: any) {
        console.error('Torrent stream failed:', err);
        alert(`Torrent error: ${err.message}`);
    } finally {
        setIsTorrentStreaming(false);
    }
  };

  const handleFshareStream = async (url: string, serverName: string, epIdx: number, srvIdx: number) => {
    setIsFshareResolving(true);
    try {
        const res = await api.get<any>(`/stream/fshare/resolve?url=${encodeURIComponent(url)}`);
        if (res.data?.stream_url) {
            const stream_url = res.data.stream_url;
            setActiveServerIdx(srvIdx);
            setActiveEpisodeIdx(epIdx);
            setActiveEmbed(stream_url); 
            localStorage.setItem('omv_active_server_name', serverName);
        } else {
            throw new Error('Backend failed to resolve Fshare link');
        }
    } catch (err: any) {
        console.error('Fshare resolve failed:', err);
        throw err; // Handle UI state in the component (show login modal)
    } finally {
        setIsFshareResolving(false);
    }
  };

  const handleFshareLogin = async (email: string, password: string) => {
    try {
        await api.post('/stream/fshare/login', { email, password });
        const res = await api.get<{ data: any }>('/user/settings');
        setUserSettings(res.data);
        return true;
    } catch (err) {
        return false;
    }
  };

  return { handleTorrentStream, handleFshareStream, handleFshareLogin };
};
