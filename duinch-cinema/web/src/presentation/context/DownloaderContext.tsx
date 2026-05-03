import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '@shared/api/config';

interface JdDevice {
  id?: string;
  name: string;
  status?: string;
}

type JdStatus = 'healthy' | 'no_credentials' | 'no_devices' | 'disconnected' | 'offline';

interface DownloaderContextType {
  isJdOnline: boolean;
  isChecking: boolean;
  status: JdStatus;
  devices: JdDevice[];
  activeDevice: string | null;
  accountEmail: string | null;
  hasCredentials: boolean;
  setActiveDevice: (name: string) => void;
  refreshStatus: () => Promise<boolean>;
  updateConfig: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<{ success: boolean; error?: string }>;
}

const DownloaderContext = createContext<DownloaderContextType | undefined>(undefined);

export const DownloaderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isJdOnline, setIsJdOnline] = useState(false);
  const [isChecking, setIsChecking] = useState(false);
  const [status, setStatus] = useState<JdStatus>('offline');
  const [devices, setDevices] = useState<JdDevice[]>([]);
  const [activeDevice, setActiveDeviceState] = useState<string | null>(localStorage.getItem('duinch_active_jd_device'));
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const lastHealthLogRef = useRef<string | null>(null);
  const lastDevicesLogRef = useRef<string | null>(null);

  const setActiveDevice = (name: string) => {
    if (activeDevice !== name) {
      console.log(`[JD] Switching active node to: ${name}`);
    }
    setActiveDeviceState(name);
    localStorage.setItem('duinch_active_jd_device', name);
  };

  const refreshStatus = useCallback(async () => {
    setIsChecking(true);
    try {
      const res = await api.get(`/downloader/health${activeDevice ? `?device=${encodeURIComponent(activeDevice)}` : ''}`);
      const nextStatus = (res.data?.status || 'offline') as JdStatus;
      const healthy = res.data?.status === 'healthy';
      const devicesList = res.data?.devices || [];

      const currentDevice = res.data?.current_device || null;
      const healthSnapshot = `${nextStatus}:${currentDevice || activeDevice || 'None'}`;
      if (lastHealthLogRef.current !== healthSnapshot) {
        console.log(`[JD Health] Status: ${healthy ? 'ONLINE' : 'OFFLINE'} | Active: ${currentDevice || activeDevice || 'None'}`);
        lastHealthLogRef.current = healthSnapshot;
      }

      if (devicesList.length > 0) {
        const deviceSummary = devicesList.map((d: any) => `${d.name} (${d.status})`).join(', ');
        if (lastDevicesLogRef.current !== deviceSummary) {
          console.log(`[JD Devices] Found ${devicesList.length} nodes:`, deviceSummary);
          lastDevicesLogRef.current = deviceSummary;
        }
      }

      setStatus(nextStatus);
      setIsJdOnline(healthy);
      setDevices(devicesList);
      setAccountEmail(res.data?.email || null);
      
      // Nếu chưa có activeDevice hoặc activeDevice không còn trong list, tự chọn cái current_device từ backend
      if ((!activeDevice || !res.data?.devices?.find((d: any) => d.name === activeDevice)) && currentDevice) {
          setActiveDevice(currentDevice);
      } else if (!res.data?.email && activeDevice) {
          setActiveDeviceState(null);
          localStorage.removeItem('duinch_active_jd_device');
      }
      
      setIsChecking(false);
      return healthy;
    } catch (err) {
      setStatus('offline');
      setIsJdOnline(false);
      setDevices([]);
      setAccountEmail(null);
      if (lastHealthLogRef.current !== 'offline') {
        console.log('[JD Health] Status: OFFLINE | Active: None');
        lastHealthLogRef.current = 'offline';
      }
      setIsChecking(false);
      return false;
    }
  }, [activeDevice]);

  const updateConfig = useCallback(async (email: string, password: string) => {
    try {
      await api.post('/downloader/config', { email, password });
      await refreshStatus();
      return { success: true };
    } catch (err: any) {
      const error =
        err?.response?.data?.detail ||
        err?.message ||
        'Unable to update JDownloader credentials';
      return { success: false, error };
    }
  }, [refreshStatus]);

  const logout = useCallback(async () => {
    try {
      await api.post('/downloader/logout');
      setStatus('no_credentials');
      setIsJdOnline(false);
      setDevices([]);
      setAccountEmail(null);
      setActiveDeviceState(null);
      localStorage.removeItem('duinch_active_jd_device');
      lastHealthLogRef.current = null;
      lastDevicesLogRef.current = null;
      return { success: true };
    } catch (err: any) {
      const error =
        err?.response?.data?.detail ||
        err?.message ||
        'Unable to logout from JDownloader';
      return { success: false, error };
    }
  }, []);

  // Periodic health check every 30 seconds
  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 30000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  return (
    <DownloaderContext.Provider
      value={{
        isJdOnline,
        isChecking,
        status,
        devices,
        activeDevice,
        accountEmail,
        hasCredentials: Boolean(accountEmail),
        setActiveDevice,
        refreshStatus,
        updateConfig,
        logout,
      }}
    >
      {children}
    </DownloaderContext.Provider>
  );
};

export const useDownloaderContext = () => {
  const context = useContext(DownloaderContext);
  if (context === undefined) {
    throw new Error('useDownloaderContext must be used within a DownloaderProvider');
  }
  return context;
};
