/**
 * React hook for sound manager integration
 *
 * Provides easy access to sound playback and mute controls.
 * Automatically initializes audio on first user interaction.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  playSound,
  playSqueakBurst,
  isMuted,
  setMuted,
  toggleMute,
  onMuteChange,
  initAudio,
  preloadSounds,
  type SoundType,
} from "../lib/soundManager";

export interface UseSoundManagerReturn {
  /** Play a sound by type */
  play: (type: SoundType) => void;
  /** Play multiple squeaks in quick succession */
  playSqueaks: (count?: number) => void;
  /** Current mute state */
  muted: boolean;
  /** Set the mute state */
  setMuted: (muted: boolean) => void;
  /** Toggle the mute state */
  toggleMute: () => void;
  /** Initialize audio (call on user interaction) */
  initAudio: () => void;
}

/**
 * Hook to access sound manager functionality in React components
 */
export function useSoundManager(): UseSoundManagerReturn {
  const [muted, setMutedState] = useState(isMuted);
  const hasInitialized = useRef(false);

  // Subscribe to mute state changes
  useEffect(() => {
    const unsubscribe = onMuteChange((newMuted) => {
      setMutedState(newMuted);
    });

    return unsubscribe;
  }, []);

  // Initialize and preload on mount
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;

    // Add a one-time interaction handler to initialize audio
    const handleInteraction = () => {
      initAudio();
      preloadSounds();
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };

    document.addEventListener("click", handleInteraction, { once: true });
    document.addEventListener("touchstart", handleInteraction, { once: true });
    document.addEventListener("keydown", handleInteraction, { once: true });

    return () => {
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("touchstart", handleInteraction);
      document.removeEventListener("keydown", handleInteraction);
    };
  }, []);

  const play = useCallback((type: SoundType) => {
    playSound(type);
  }, []);

  const playSqueaks = useCallback((count?: number) => {
    playSqueakBurst(count);
  }, []);

  const handleSetMuted = useCallback((newMuted: boolean) => {
    setMuted(newMuted);
  }, []);

  const handleToggleMute = useCallback(() => {
    toggleMute();
  }, []);

  const handleInitAudio = useCallback(() => {
    initAudio();
    preloadSounds();
  }, []);

  return {
    play,
    playSqueaks,
    muted,
    setMuted: handleSetMuted,
    toggleMute: handleToggleMute,
    initAudio: handleInitAudio,
  };
}

/**
 * Hook for playing a sound on mount (useful for page transitions)
 */
export function useSoundOnMount(type: SoundType): void {
  const hasFired = useRef(false);

  useEffect(() => {
    if (hasFired.current) return;
    hasFired.current = true;

    // Small delay to ensure audio context is ready
    const timer = setTimeout(() => {
      playSound(type);
    }, 100);

    return () => clearTimeout(timer);
  }, [type]);
}

/**
 * Hook for playing celebration sound when a condition becomes true
 */
export function useCelebrationSound(shouldCelebrate: boolean): void {
  const hasCelebrated = useRef(false);

  useEffect(() => {
    if (shouldCelebrate && !hasCelebrated.current) {
      hasCelebrated.current = true;
      playSound("celebration");
    }
  }, [shouldCelebrate]);
}
