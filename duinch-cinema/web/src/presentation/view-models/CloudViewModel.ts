import { useState, useEffect } from 'react';
import { getEnabledTargets, type CloudTarget } from '@shared/services/cloudTargets';

/**
 * ViewModel: CloudViewModel
 * Quản lý danh sách các dịch vụ đám mây (Fshare, GDrive...) đang khả dụng.
 */
export function useCloudViewModel(): CloudTarget[] {
  const [targets, setTargets] = useState<CloudTarget[]>(getEnabledTargets());

  useEffect(() => {
    const refresh = () => setTargets(getEnabledTargets());
    window.addEventListener('cloud-targets-changed', refresh);
    return () => window.removeEventListener('cloud-targets-changed', refresh);
  }, []);

  return targets;
}
