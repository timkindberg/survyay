import { describe, it, expect } from "vitest";
import {
  calculateElevationGain,
  applyElevationGain,
  hasReachedSummit,
  ELEVATION_MAX,
  ELEVATION_MIN,
  GRACE_PERIOD,
  RAMP_END,
  SUMMIT,
} from "../../lib/elevation";

describe("calculateElevationGain", () => {
  describe("grace period (0-2 seconds)", () => {
    it("returns max elevation for instant answers (0ms)", () => {
      expect(calculateElevationGain(0)).toBe(ELEVATION_MAX);
    });

    it("returns max elevation for very fast answers (500ms)", () => {
      expect(calculateElevationGain(500)).toBe(ELEVATION_MAX);
    });

    it("returns max elevation for answers at 1 second", () => {
      expect(calculateElevationGain(1000)).toBe(ELEVATION_MAX);
    });

    it("returns max elevation for answers at exactly grace period (2s)", () => {
      expect(calculateElevationGain(2000)).toBe(ELEVATION_MAX);
    });
  });

  describe("linear ramp (2-15 seconds)", () => {
    it("starts decreasing just after grace period", () => {
      const gain = calculateElevationGain(2500); // 2.5 seconds
      expect(gain).toBeLessThan(ELEVATION_MAX);
      expect(gain).toBeGreaterThan(ELEVATION_MIN);
    });

    it("returns ~75m at midpoint of ramp (~8.5s)", () => {
      // Midpoint: 2 + (15-2)/2 = 8.5 seconds
      const gain = calculateElevationGain(8500);
      // Should be roughly 75m (midpoint between 100 and 50)
      expect(gain).toBeGreaterThanOrEqual(73);
      expect(gain).toBeLessThanOrEqual(77);
    });

    it("decreases linearly through the ramp", () => {
      const times = [3000, 5000, 7000, 9000, 11000, 13000];
      const gains = times.map(calculateElevationGain);

      // Each subsequent gain should be less than or equal to previous
      for (let i = 1; i < gains.length; i++) {
        expect(gains[i]).toBeLessThanOrEqual(gains[i - 1]!);
      }
    });

    it("returns just above floor near end of ramp (14s)", () => {
      const gain = calculateElevationGain(14000);
      expect(gain).toBeGreaterThan(ELEVATION_MIN);
      expect(gain).toBeLessThan(ELEVATION_MIN + 10);
    });
  });

  describe("floor (15+ seconds)", () => {
    it("returns floor elevation at exactly 15 seconds", () => {
      expect(calculateElevationGain(15000)).toBe(ELEVATION_MIN);
    });

    it("returns floor elevation for slow answers (20s)", () => {
      expect(calculateElevationGain(20000)).toBe(ELEVATION_MIN);
    });

    it("returns floor elevation for very slow answers (60s)", () => {
      expect(calculateElevationGain(60000)).toBe(ELEVATION_MIN);
    });

    it("returns floor elevation for extremely slow answers (5 minutes)", () => {
      expect(calculateElevationGain(300000)).toBe(ELEVATION_MIN);
    });
  });

  describe("edge cases", () => {
    it("handles negative time (defaults to max)", () => {
      // Negative time shouldn't happen, but if it does, treat as instant
      expect(calculateElevationGain(-1000)).toBe(ELEVATION_MAX);
    });

    it("returns integer values (rounded)", () => {
      // Check several points in the ramp to ensure we get integers
      const times = [2100, 4567, 7890, 10123, 12456];
      times.forEach((time) => {
        const gain = calculateElevationGain(time);
        expect(Number.isInteger(gain)).toBe(true);
      });
    });

    it("never exceeds max elevation", () => {
      expect(calculateElevationGain(0)).toBeLessThanOrEqual(ELEVATION_MAX);
    });

    it("never goes below min elevation", () => {
      expect(calculateElevationGain(999999)).toBeGreaterThanOrEqual(ELEVATION_MIN);
    });
  });

  describe("specific boundary values", () => {
    it("at 2500ms returns less than max (well into ramp)", () => {
      const gain = calculateElevationGain(2500);
      expect(gain).toBeLessThan(ELEVATION_MAX);
    });

    it("at 14000ms returns more than floor (still in ramp)", () => {
      const gain = calculateElevationGain(14000);
      expect(gain).toBeGreaterThan(ELEVATION_MIN);
    });

    it("rounding at boundaries is predictable", () => {
      // At 2001ms, we're 0.001s into the ramp
      // Gain = 100 - (0.001/13) * 50 ≈ 100 - 0.004 ≈ 100 (rounds to 100)
      const gain2001 = calculateElevationGain(2001);
      expect(gain2001).toBe(100); // Rounds to max

      // At 14999ms, we're 12.999s into the ramp
      // Gain = 100 - (12.999/13) * 50 ≈ 100 - 49.996 ≈ 50 (rounds to 50)
      const gain14999 = calculateElevationGain(14999);
      expect(gain14999).toBe(50); // Rounds to floor
    });
  });
});

describe("applyElevationGain", () => {
  it("adds gain to current elevation", () => {
    expect(applyElevationGain(100, 50)).toBe(150);
  });

  it("caps at summit when gain would exceed", () => {
    expect(applyElevationGain(950, 100)).toBe(SUMMIT);
  });

  it("stays at summit if already at summit", () => {
    expect(applyElevationGain(SUMMIT, 100)).toBe(SUMMIT);
  });

  it("handles starting from 0", () => {
    expect(applyElevationGain(0, 100)).toBe(100);
  });

  it("handles 0 gain", () => {
    expect(applyElevationGain(500, 0)).toBe(500);
  });
});

describe("hasReachedSummit", () => {
  it("returns false when below summit", () => {
    expect(hasReachedSummit(0)).toBe(false);
    expect(hasReachedSummit(500)).toBe(false);
    expect(hasReachedSummit(999)).toBe(false);
  });

  it("returns true at exactly summit", () => {
    expect(hasReachedSummit(SUMMIT)).toBe(true);
  });

  it("returns true above summit (edge case)", () => {
    expect(hasReachedSummit(SUMMIT + 1)).toBe(true);
  });
});

describe("constants", () => {
  it("has expected values", () => {
    expect(ELEVATION_MAX).toBe(100);
    expect(ELEVATION_MIN).toBe(50);
    expect(GRACE_PERIOD).toBe(2);
    expect(RAMP_END).toBe(15);
    expect(SUMMIT).toBe(1000);
  });

  it("grace period is less than ramp end", () => {
    expect(GRACE_PERIOD).toBeLessThan(RAMP_END);
  });

  it("min elevation is positive", () => {
    expect(ELEVATION_MIN).toBeGreaterThan(0);
  });

  it("max elevation is greater than min", () => {
    expect(ELEVATION_MAX).toBeGreaterThan(ELEVATION_MIN);
  });
});
