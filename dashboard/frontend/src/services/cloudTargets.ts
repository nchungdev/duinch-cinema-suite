// ── Cloud Download Targets ────────────────────────────────────────────────────
// Each target represents a cloud destination the user can send downloads to.
// Stored in localStorage. Settings page can add/remove/configure targets.

export interface CloudTarget {
  id: string;
  label: string;
  icon: 'server' | 'hard-drive' | 'globe' | 'box' | 'cloud';
  color: string;      // tailwind text-* class
  bgColor: string;    // tailwind bg-*/border-* classes
  enabled: boolean;
  /** Optional: API endpoint or config key used when sending to this target */
  endpoint?: string;
}

export const CLOUD_TARGET_DEFINITIONS: Omit<CloudTarget, 'enabled'>[] = [
  {
    id: 'jdownloader',
    label: 'JD',
    icon: 'hard-drive',
    color: 'text-green-400',
    bgColor: 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20',
    endpoint: '/api/downloader/add',
  },
  {
    id: 'omv',
    label: 'OMV',
    icon: 'server',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20',
    endpoint: '/api/omv/download',
  },
  {
    id: 'gdrive',
    label: 'Drive',
    icon: 'globe',
    color: 'text-yellow-400',
    bgColor: 'bg-yellow-500/10 border-yellow-500/20 hover:bg-yellow-500/20',
    endpoint: '/api/gdrive/upload',
  },
  {
    id: 'terabox',
    label: 'Tera',
    icon: 'box',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20 hover:bg-purple-500/20',
    endpoint: '/api/terabox/upload',
  },
];

const STORAGE_KEY = 'cloud_targets_enabled';

/** Returns the list of currently enabled cloud targets (from localStorage) */
export function getEnabledTargets(): CloudTarget[] {
  let enabled: string[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    enabled = raw ? JSON.parse(raw) : [];
  } catch { /* ignore */ }

  return CLOUD_TARGET_DEFINITIONS
    .filter(t => enabled.includes(t.id))
    .map(t => ({ ...t, enabled: true }));
}

/** Enable or disable a cloud target by id */
export function setTargetEnabled(id: string, on: boolean) {
  let enabled: string[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    enabled = raw ? JSON.parse(raw) : [];
  } catch { /* ignore */ }

  if (on && !enabled.includes(id)) enabled.push(id);
  if (!on) enabled = enabled.filter(x => x !== id);

  localStorage.setItem(STORAGE_KEY, JSON.stringify(enabled));
  window.dispatchEvent(new Event('cloud-targets-changed'));
}

export function getAllTargetDefs() {
  let enabled: string[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    enabled = raw ? JSON.parse(raw) : [];
  } catch { /* ignore */ }
  return CLOUD_TARGET_DEFINITIONS.map(t => ({ ...t, enabled: enabled.includes(t.id) }));
}
