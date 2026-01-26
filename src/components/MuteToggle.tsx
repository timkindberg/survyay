/**
 * Mute Toggle Button Component
 *
 * A simple button to toggle sound on/off.
 * Uses speaker icons to indicate state.
 */

import { useSoundManager } from "../hooks/useSoundManager";

interface MuteToggleProps {
  /** Additional CSS class name */
  className?: string;
  /** Size of the button in pixels */
  size?: number;
}

export function MuteToggle({ className = "", size = 40 }: MuteToggleProps) {
  const { muted, toggleMute, initAudio } = useSoundManager();

  const handleClick = () => {
    // Initialize audio on first interaction
    initAudio();
    toggleMute();
  };

  return (
    <button
      onClick={handleClick}
      className={`mute-toggle ${className}`}
      style={{
        width: size,
        height: size,
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: muted ? "#94a3b8" : "#6366f1",
        borderRadius: "50%",
        border: "none",
        cursor: "pointer",
        transition: "background 0.2s, transform 0.1s",
      }}
      aria-label={muted ? "Unmute sounds" : "Mute sounds"}
      title={muted ? "Click to unmute" : "Click to mute"}
    >
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {muted ? (
          // Muted icon (speaker with X)
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <line x1="23" y1="9" x2="17" y2="15" />
            <line x1="17" y1="9" x2="23" y2="15" />
          </>
        ) : (
          // Unmuted icon (speaker with sound waves)
          <>
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
            <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
          </>
        )}
      </svg>
    </button>
  );
}
