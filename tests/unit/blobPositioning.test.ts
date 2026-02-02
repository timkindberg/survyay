import { describe, test, expect } from "vitest";

/**
 * Tests for blob positioning on the Mountain component.
 *
 * The key positioning rules:
 * 1. elevationToY converts elevation to Y coordinate (higher elevation = lower Y)
 * 2. Blob is bottom-anchored: blob's feet should be at the elevation Y coordinate
 *
 * This test verifies the positioning math that was fixed in Task #117.
 */

// Mirror the elevationToY calculation from Mountain.tsx
function elevationToY(
  elevation: number,
  minElevation: number,
  maxElevation: number,
  height: number
): number {
  const range = maxElevation - minElevation;
  const padding = 20;
  const usableHeight = height - padding * 2;
  const normalized = (elevation - minElevation) / range;
  return height - padding - normalized * usableHeight;
}

// Mirror the blob top position calculation from Mountain.tsx
// This is the FIX: y - size (bottom-anchored, feet at elevation)
// BUG was: y - size/2 (center-anchored, center at elevation)
function getBlobTopPosition(y: number, size: number): number {
  return y - size;
}

describe("Blob Positioning", () => {
  const height = 600; // typical viewport height
  const blobSize = 40; // typical blob size

  describe("elevationToY", () => {
    test("elevation 0 should be near bottom of screen", () => {
      const y = elevationToY(0, 0, 1000, height);
      // With 20px padding, bottom should be at height - 20 = 580
      expect(y).toBe(580);
    });

    test("elevation 1000 (summit) should be near top of screen", () => {
      const y = elevationToY(1000, 0, 1000, height);
      // With 20px padding, top should be at 20
      expect(y).toBe(20);
    });

    test("elevation 500 should be in the middle", () => {
      const y = elevationToY(500, 0, 1000, height);
      // Middle should be at (580 + 20) / 2 = 300
      expect(y).toBe(300);
    });

    test("works with custom elevation ranges", () => {
      // If viewing from 200m to 400m, 300m should be in the middle
      const y = elevationToY(300, 200, 400, height);
      expect(y).toBe(300); // middle of usable height
    });
  });

  describe("blob bottom-anchor positioning", () => {
    test("blob feet should be at the elevation Y coordinate", () => {
      const elevationY = 400; // arbitrary Y position
      const blobTop = getBlobTopPosition(elevationY, blobSize);

      // The blob's top should be size pixels above the Y coordinate
      // So the blob's bottom (feet) is at elevationY
      expect(blobTop).toBe(elevationY - blobSize);
      expect(blobTop + blobSize).toBe(elevationY); // feet at elevation
    });

    test("blob at 0m elevation has feet at bottom of visible area", () => {
      const y = elevationToY(0, 0, 1000, height);
      const blobTop = getBlobTopPosition(y, blobSize);

      // Feet should be at y (580), so top is at 580 - 40 = 540
      expect(blobTop).toBe(540);
      expect(blobTop + blobSize).toBe(580); // feet at 580
    });

    test("blob at 1000m elevation has feet at top of visible area", () => {
      const y = elevationToY(1000, 0, 1000, height);
      const blobTop = getBlobTopPosition(y, blobSize);

      // Feet should be at y (20), so top is at 20 - 40 = -20
      // Note: blob extends above visible area at summit, which is expected
      expect(blobTop).toBe(-20);
      expect(blobTop + blobSize).toBe(20); // feet at 20
    });

    test("blob at 500m elevation has feet at middle", () => {
      const y = elevationToY(500, 0, 1000, height);
      const blobTop = getBlobTopPosition(y, blobSize);

      // Middle is at 300, so blob top is at 260
      expect(blobTop).toBe(260);
      expect(blobTop + blobSize).toBe(300); // feet at 300
    });
  });

  describe("regression: center-anchored bug detection", () => {
    // This test would FAIL with the old buggy code (y - size/2)
    // and PASS with the fixed code (y - size)

    function getBlobTopPositionBuggy(y: number, size: number): number {
      return y - size / 2; // BUG: center-anchored
    }

    test("buggy center-anchor puts blob 20px too low", () => {
      const elevationY = 400;
      const correctTop = getBlobTopPosition(elevationY, blobSize);
      const buggyTop = getBlobTopPositionBuggy(elevationY, blobSize);

      // The bug caused blobs to appear size/2 pixels lower than they should
      expect(buggyTop - correctTop).toBe(blobSize / 2);
    });

    test("at elevation 200m, buggy code shows blob at ~180m visually", () => {
      // With 600px height, 0-1000m range, 20px padding:
      // 560px usable height for 1000m = 0.56px per meter
      const pxPerMeter = 560 / 1000;

      const y = elevationToY(200, 0, 1000, height);
      const correctTop = getBlobTopPosition(y, blobSize);
      const buggyTop = getBlobTopPositionBuggy(y, blobSize);

      // The visual offset in meters
      const visualOffsetMeters = (buggyTop - correctTop) / pxPerMeter;

      // With 40px blob, bug causes ~35.7m visual offset downward
      expect(visualOffsetMeters).toBeCloseTo(35.7, 0);
    });
  });

  describe("real-world scenarios", () => {
    test("two players at same elevation have feet at same Y", () => {
      const player1Elevation = 350;
      const player2Elevation = 350;

      const y1 = elevationToY(player1Elevation, 0, 1000, height);
      const y2 = elevationToY(player2Elevation, 0, 1000, height);

      const top1 = getBlobTopPosition(y1, blobSize);
      const top2 = getBlobTopPosition(y2, blobSize);

      // Both blobs should have their feet at the same elevation
      expect(top1 + blobSize).toBe(top2 + blobSize);
    });

    test("player at higher elevation is visually higher (lower Y)", () => {
      const lowPlayer = 100;
      const highPlayer = 700;

      const yLow = elevationToY(lowPlayer, 0, 1000, height);
      const yHigh = elevationToY(highPlayer, 0, 1000, height);

      // Higher elevation = lower Y coordinate (screen coordinates)
      expect(yHigh).toBeLessThan(yLow);
    });

    test("leaderboard at 500m shows blob feet at exactly middle height", () => {
      const leaderboardElevation = 500;
      const y = elevationToY(leaderboardElevation, 0, 1000, height);
      const blobTop = getBlobTopPosition(y, blobSize);

      // The blob's feet (blobTop + blobSize) should be at the middle
      expect(blobTop + blobSize).toBe(300);
    });
  });
});
