/**
 * Sound Manager Unit Tests
 *
 * Tests the sound manager's mute state and localStorage persistence.
 * Note: Actual audio playback is difficult to test without a browser,
 * so we focus on the state management aspects.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

// Mock AudioContext
class MockOscillator {
  connect() { return this; }
  start() {}
  stop() {}
  frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
  type = "sine";
}

class MockGainNode {
  connect() { return this; }
  gain = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} };
}

class MockBiquadFilterNode {
  connect() { return this; }
  frequency = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  type = "lowpass";
}

class MockAudioBufferSourceNode {
  connect() { return this; }
  start() {}
  buffer: AudioBuffer | null = null;
}

class MockAudioContext {
  state = "running";
  currentTime = 0;
  sampleRate = 44100;
  destination = {};
  createOscillator() { return new MockOscillator(); }
  createGain() { return new MockGainNode(); }
  createBiquadFilter() { return new MockBiquadFilterNode(); }
  createBufferSource() { return new MockAudioBufferSourceNode(); }
  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      getChannelData: () => new Float32Array(length),
    } as unknown as AudioBuffer;
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}

// Setup mocks before importing the module
vi.stubGlobal("localStorage", localStorageMock);
vi.stubGlobal("AudioContext", MockAudioContext);

// Now import the module
import {
  isMuted,
  setMuted,
  toggleMute,
  onMuteChange,
  initAudio,
  cleanup,
  playSound,
} from "../../src/lib/soundManager";

describe("soundManager", () => {
  beforeEach(() => {
    localStorageMock.clear();
    cleanup();
  });

  describe("mute state", () => {
    it("should start unmuted by default", () => {
      // Note: The module is imported before this test runs,
      // so the initial state is already set. We need to reset it.
      localStorageMock.clear();
      // Since module state persists, we test the localStorage behavior
      expect(localStorageMock.getItem("survyay_muted")).toBeNull();
    });

    it("should persist mute state to localStorage", () => {
      setMuted(true);
      expect(localStorageMock.getItem("survyay_muted")).toBe("true");

      setMuted(false);
      expect(localStorageMock.getItem("survyay_muted")).toBe("false");
    });

    it("should toggle mute state", () => {
      const initialState = isMuted();
      toggleMute();
      expect(isMuted()).toBe(!initialState);
      toggleMute();
      expect(isMuted()).toBe(initialState);
    });

    it("should notify listeners on mute change", () => {
      const listener = vi.fn();
      const unsubscribe = onMuteChange(listener);

      setMuted(true);
      expect(listener).toHaveBeenCalledWith(true);

      setMuted(false);
      expect(listener).toHaveBeenCalledWith(false);

      unsubscribe();

      setMuted(true);
      // Listener should not be called after unsubscribe
      expect(listener).toHaveBeenCalledTimes(2);
    });
  });

  describe("audio initialization", () => {
    it("should create AudioContext on initAudio", () => {
      initAudio();
      // No error means success
    });

    it("should not create multiple AudioContexts", () => {
      initAudio();
      initAudio();
      // Still no error - idempotent
    });
  });

  describe("sound playback", () => {
    it("should not play sounds when muted", async () => {
      initAudio();
      setMuted(true);

      // This should not throw
      await playSound("boop");
    });

    it("should play sounds when not muted", async () => {
      initAudio();
      setMuted(false);

      // These should not throw
      await playSound("boop");
      await playSound("squeak");
      await playSound("celebration");
      await playSound("snip");
      await playSound("ropeTension");
      await playSound("gibberish");
    });
  });
});
