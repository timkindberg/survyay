import { describe, it, expect } from "vitest";
import {
  calculateElevationGain,
  calculateBaseScore,
  calculateMinorityBonus,
  applyElevationGain,
  hasReachedSummit,
  calculateDynamicMax,
  SUMMIT,
} from "../../lib/elevation";

describe("calculateBaseScore", () => {
  describe("linear timing formula (0-10 seconds)", () => {
    it("returns 125m for instant answer (0ms)", () => {
      expect(calculateBaseScore(0)).toBe(125);
    });

    it("returns 113m (rounded) for 1 second", () => {
      // 125 - 12.5 = 112.5, rounds to 113
      expect(calculateBaseScore(1000)).toBe(113);
    });

    it("returns 63m (rounded) for 5 seconds", () => {
      // 125 - 62.5 = 62.5, rounds to 63
      expect(calculateBaseScore(5000)).toBe(63);
    });

    it("returns 0m for 10 seconds", () => {
      expect(calculateBaseScore(10000)).toBe(0);
    });

    it("returns 0m for anything over 10 seconds", () => {
      expect(calculateBaseScore(15000)).toBe(0);
      expect(calculateBaseScore(60000)).toBe(0);
    });
  });

  describe("edge cases", () => {
    it("handles negative time (treats as instant)", () => {
      expect(calculateBaseScore(-1000)).toBe(125);
    });

    it("returns integer values (rounded)", () => {
      const times = [1234, 2567, 4890, 7123, 9456];
      times.forEach((time) => {
        const score = calculateBaseScore(time);
        expect(Number.isInteger(score)).toBe(true);
      });
    });

    it("decreases linearly from 0-10s", () => {
      // At 0s: 125, at 10s: 0
      // Decrease is 12.5m per second
      expect(calculateBaseScore(0)).toBe(125);
      expect(calculateBaseScore(2000)).toBe(100); // 125 - 25 = 100
      expect(calculateBaseScore(4000)).toBe(75);  // 125 - 50 = 75
      expect(calculateBaseScore(6000)).toBe(50);  // 125 - 75 = 50
      expect(calculateBaseScore(8000)).toBe(25);  // 125 - 100 = 25
      expect(calculateBaseScore(10000)).toBe(0);  // 125 - 125 = 0
    });
  });
});

describe("calculateMinorityBonus", () => {
  describe("bonus calculation", () => {
    it("gives max bonus (50m) when alone", () => {
      // 1 player chose this, 10 total: aloneRatio = 0.9
      expect(calculateMinorityBonus(1, 10)).toBe(45);
    });

    it("gives ~25m bonus when half chose this answer", () => {
      // 5 players chose this, 10 total: aloneRatio = 0.5
      expect(calculateMinorityBonus(5, 10)).toBe(25);
    });

    it("gives 0m bonus when everyone chose this answer", () => {
      // 10 players chose this, 10 total: aloneRatio = 0.0
      expect(calculateMinorityBonus(10, 10)).toBe(0);
    });

    it("gives ~33m bonus when 2/3 chose different answer", () => {
      // 3 players chose this, 9 total: aloneRatio = 2/3
      expect(calculateMinorityBonus(3, 9)).toBe(33);
    });
  });

  describe("edge cases", () => {
    it("handles 0 total answers", () => {
      expect(calculateMinorityBonus(0, 0)).toBe(0);
    });

    it("handles single player (alone)", () => {
      expect(calculateMinorityBonus(1, 1)).toBe(0); // Only player = majority
    });

    it("returns integer values (rounded)", () => {
      const pairs = [
        [1, 7],
        [2, 9],
        [3, 13],
        [5, 17],
      ];
      pairs.forEach(([onLadder, total]) => {
        const bonus = calculateMinorityBonus(onLadder!, total!);
        expect(Number.isInteger(bonus)).toBe(true);
      });
    });
  });
});

describe("calculateElevationGain", () => {
  describe("combined scoring", () => {
    it("combines base score and minority bonus", () => {
      // Fast answer (0s) + alone (1/10): 125 + 45 = 170m
      const result = calculateElevationGain(0, 1, 10);
      expect(result.baseScore).toBe(125);
      expect(result.minorityBonus).toBe(45);
      expect(result.total).toBe(170);
    });

    it("fast answer in majority group", () => {
      // Fast answer (0s) + majority (10/10): 125 + 0 = 125m
      const result = calculateElevationGain(0, 10, 10);
      expect(result.baseScore).toBe(125);
      expect(result.minorityBonus).toBe(0);
      expect(result.total).toBe(125);
    });

    it("slow answer alone", () => {
      // Slow answer (10s+) + alone (1/10): 0 + 45 = 45m
      const result = calculateElevationGain(15000, 1, 10);
      expect(result.baseScore).toBe(0);
      expect(result.minorityBonus).toBe(45);
      expect(result.total).toBe(45);
    });

    it("medium speed, medium minority", () => {
      // Medium speed (5s) + half chose (5/10): 63 + 25 = 88m
      const result = calculateElevationGain(5000, 5, 10);
      expect(result.baseScore).toBe(63);
      expect(result.minorityBonus).toBe(25);
      expect(result.total).toBe(88);
    });
  });

  describe("realistic game scenarios", () => {
    it("fast player in small minority gets huge bonus", () => {
      // 1s response, only 2 out of 20 players chose this
      const result = calculateElevationGain(1000, 2, 20);
      expect(result.baseScore).toBe(113); // 125 - 12.5 = 112.5 -> 113
      expect(result.minorityBonus).toBe(45); // 90% alone
      expect(result.total).toBe(158);
    });

    it("slow player in majority gets minimal points", () => {
      // 8s response, 15 out of 20 players chose this
      const result = calculateElevationGain(8000, 15, 20);
      expect(result.baseScore).toBe(25); // 125 - 100 = 25
      expect(result.minorityBonus).toBe(13); // Only 25% alone
      expect(result.total).toBe(38);
    });
  });
});

describe("applyElevationGain", () => {
  it("adds gain to current elevation", () => {
    expect(applyElevationGain(100, 50)).toBe(150);
  });

  it("allows exceeding summit (no cap)", () => {
    // Elevation is no longer capped - players can exceed 1000m for bonus
    expect(applyElevationGain(950, 100)).toBe(1050);
  });

  it("allows continued gains above summit", () => {
    // Players at summit can still earn bonus elevation
    expect(applyElevationGain(SUMMIT, 100)).toBe(1100);
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
  it("has expected summit value", () => {
    expect(SUMMIT).toBe(1000);
  });
});

describe("calculateDynamicMax", () => {
  describe("boost-only logic (never reduces below 175m floor)", () => {
    it("returns floor of 175m for normal situations", () => {
      // Leader at 700m, 3 questions left: (1000-700)/3 = 100m < 175 -> returns 175
      expect(calculateDynamicMax(700, 3)).toBe(175);
    });

    it("returns floor for even distribution below threshold", () => {
      // Leader at 500m, 5 questions left: (1000-500)/5 = 100m < 175 -> returns 175
      expect(calculateDynamicMax(500, 5)).toBe(175);
    });

    it("returns floor when many questions remain", () => {
      // Leader at 50m, 10 questions left: (1000-50)/10 = 95m < 175 -> returns 175
      expect(calculateDynamicMax(50, 10)).toBe(175);
    });

    it("returns floor for typical late game", () => {
      // Leader at 900m, 2 questions left: (1000-900)/2 = 50m < 175 -> returns 175
      expect(calculateDynamicMax(900, 2)).toBe(175);
    });

    it("boosts above 175m when catch-up needed", () => {
      // Leader at 500m, 2 questions left: (1000-500)/2 = 250m > 175 -> returns 250
      expect(calculateDynamicMax(500, 2)).toBe(250);

      // Leader at 300m, 2 questions left: (1000-300)/2 = 350m > 175 -> returns 350
      expect(calculateDynamicMax(300, 2)).toBe(350);

      // Leader at 0m, 4 questions left: 1000/4 = 250m > 175 -> returns 250
      expect(calculateDynamicMax(0, 4)).toBe(250);
    });
  });

  describe("minimum floor is always 175m", () => {
    it("never returns below 175m", () => {
      // Even very small distances return 175
      expect(calculateDynamicMax(950, 1)).toBe(175);
      expect(calculateDynamicMax(975, 1)).toBe(175);
      expect(calculateDynamicMax(990, 1)).toBe(175);
    });

    it("returns 175m for most normal game scenarios", () => {
      const scenarios = [
        { leader: 0, questions: 10 },
        { leader: 100, questions: 9 },
        { leader: 200, questions: 8 },
        { leader: 300, questions: 7 },
        { leader: 400, questions: 6 },
        { leader: 500, questions: 5 },
        { leader: 600, questions: 4 },
        { leader: 700, questions: 3 },
        { leader: 800, questions: 2 },
        { leader: 900, questions: 1 },
      ];

      scenarios.forEach(({ leader, questions }) => {
        const cap = calculateDynamicMax(leader, questions);
        expect(cap).toBeGreaterThanOrEqual(175);
      });
    });
  });

  describe("edge cases", () => {
    it("handles leader at summit (all non-summited filtered)", () => {
      // All players summited: distance = 0 or negative, should return 175
      expect(calculateDynamicMax(1000, 5)).toBe(175);
    });

    it("handles leader beyond summit", () => {
      // Above summit (shouldn't happen, but handle gracefully)
      expect(calculateDynamicMax(1050, 5)).toBe(175);
    });

    it("handles 0 questions remaining", () => {
      // Last question edge case - return 175
      expect(calculateDynamicMax(500, 0)).toBe(175);
    });

    it("handles negative questions remaining", () => {
      // Edge case: return 175
      expect(calculateDynamicMax(500, -1)).toBe(175);
    });

    it("handles leader at 0 with few questions (boost scenario)", () => {
      // Start of short game: 1000/4 = 250m (boost)
      expect(calculateDynamicMax(0, 4)).toBe(250);
    });

    it("handles leader at 0 with many questions", () => {
      // Start of long game: 1000/10 = 100m < 175 -> 175
      expect(calculateDynamicMax(0, 10)).toBe(175);
    });
  });

  describe("realistic game scenarios", () => {
    it("early game: 175m floor allows good progress", () => {
      // Question 1 reveal: leader at ~100m, 9 questions left
      // (1000-100)/9 = 100m < 175 -> returns 175
      expect(calculateDynamicMax(100, 9)).toBe(175);
    });

    it("mid game: 175m floor maintained", () => {
      // Question 5 reveal: leader at 500m, 5 questions left
      // (1000-500)/5 = 100m < 175 -> returns 175
      expect(calculateDynamicMax(500, 5)).toBe(175);
    });

    it("late game with tight race: 175m floor maintained", () => {
      // Question 8 reveal: leader at 850m, 2 questions left
      // (1000-850)/2 = 75m < 175 -> returns 175
      expect(calculateDynamicMax(850, 2)).toBe(175);
    });

    it("final question: 175m floor ensures easy summit", () => {
      // Question 9 reveal: leader at 975m, 1 question left
      // (1000-975)/1 = 25m < 175 -> returns 175 (easy summit)
      expect(calculateDynamicMax(975, 1)).toBe(175);
    });

    it("catch-up scenario: boost above 175m", () => {
      // Leader very far ahead: everyone else far behind
      // If non-summited leader is at 200m with 2 questions left
      // (1000-200)/2 = 400m > 175 -> returns 400 (major boost)
      expect(calculateDynamicMax(200, 2)).toBe(400);
    });
  });

  describe("rounding behavior", () => {
    it("rounds to nearest integer", () => {
      // 1000-333 = 667, 667/3 = 222.33... -> rounds to 222
      expect(calculateDynamicMax(333, 3)).toBe(222);

      // 1000-250 = 750, 750/3 = 250 -> returns 250
      expect(calculateDynamicMax(250, 3)).toBe(250);
    });

    it("always returns integer values", () => {
      const scenarios = [
        { leader: 123, questions: 2 },
        { leader: 456, questions: 2 },
        { leader: 100, questions: 3 },
      ];

      scenarios.forEach(({ leader, questions }) => {
        const cap = calculateDynamicMax(leader, questions);
        expect(Number.isInteger(cap)).toBe(true);
      });
    });
  });
});
