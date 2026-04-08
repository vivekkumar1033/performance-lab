import { useState } from 'react';
import { RUNTIME_PROFILES, DEFAULT_RUNTIME_PROFILE_ID } from '../constants';

interface ProfileSelectorProps {
  onProfileChange: (profileId: string) => void;
  disabled?: boolean;
}

export default function ProfileSelector({
  onProfileChange,
  disabled = false,
}: ProfileSelectorProps) {
  const [selectedId, setSelectedId] = useState(DEFAULT_RUNTIME_PROFILE_ID);

  const profiles = Object.values(RUNTIME_PROFILES);

  function handleChange(profileId: string) {
    setSelectedId(profileId);
    onProfileChange(profileId);
  }

  return (
    <div className="rounded-lg border border-surface-card-border bg-surface-card p-4">
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
        Runtime Profile
      </h3>
      <div className="flex flex-col gap-2">
        {profiles.map(profile => {
          const isActive = profile.id === selectedId;
          return (
            <button
              key={profile.id}
              onClick={() => handleChange(profile.id)}
              disabled={disabled}
              className={`
                flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors
                ${isActive
                  ? 'bg-accent/15 text-accent ring-1 ring-accent/30'
                  : 'bg-surface-hover/50 text-text-secondary hover:bg-surface-hover'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div>
                <div className={`font-medium ${isActive ? 'text-accent' : 'text-text-primary'}`}>
                  {profile.label}
                </div>
                <div className="mt-0.5 text-[11px] text-text-secondary">
                  {formatProfileSummary(profile)}
                </div>
              </div>
              {isActive && (
                <span className="flex h-2 w-2 rounded-full bg-accent" />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[10px] text-text-secondary/60">
        Profiles deterministically modify timings. Same profile + same fixes = same results.
      </p>
    </div>
  );
}

function formatProfileSummary(profile: { bandwidthKbps: number; rttMs: number; cpuMultiplier: number }): string {
  const bw = profile.bandwidthKbps >= 1000
    ? `${(profile.bandwidthKbps / 1000).toFixed(0)} Mbps`
    : `${profile.bandwidthKbps} Kbps`;
  const cpu = profile.cpuMultiplier === 1
    ? 'No CPU throttle'
    : `${profile.cpuMultiplier}x CPU`;
  return `${bw} / ${profile.rttMs}ms RTT / ${cpu}`;
}
