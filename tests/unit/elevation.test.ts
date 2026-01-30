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
    it("returns 100m for instant answer (0ms)", () => {
      expect(calculateBaseScore(0)).toBe(100);
    });

    it("returns 90m for 1 second", () => {
      expect(calculateBaseScore(1000)).toBe(90);
    });

    it("returns 50m for 5 seconds", () => {
      expect(calculateBaseScore(5000)).toBe(50);
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
      expect(calculateBaseScore(-1000)).toBe(100);
    });

    it("returns integer values (rounded)", () => {
      const times = [1234, 2567, 4890, 7123, 9456];
      times.forEach((time) => {
        const score = calculateBaseScore(time);
        expect(Number.isInteger(score)).toBe(true);
      });
    });

    it("decreases linearly from 0-10s", () => {
      const times = [0, 1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000];
      const scores = times.map(calculateBaseScore);

      // Each subsequent score should be exactly 10 less
      for (let i = 1; i < scores.length; i++) {
        expect(scores[i]).toBe(scores[i - 1]! - 10);
      }
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
      // Fast answer (0s) + alone (1/10): 100 + 45 = 145m
      const result = calculateElevationGain(0, 1, 10);
      expect(result.baseScore).toBe(100);
      expect(result.minorityBonus).toBe(45);
      expect(result.total).toBe(145);
    });

    it("fast answer in majority group", () => {
      // Fast answer (0s) + majority (10/10): 100 + 0 = 100m
      const result = calculateElevationGain(0, 10, 10);
      expect(result.baseScore).toBe(100);
      expect(result.minorityBonus).toBe(0);
      expect(result.total).toBe(100);
    });

    it("slow answer alone", () => {
      // Slow answer (10s+) + alone (1/10): 0 + 45 = 45m
      const result = calculateElevationGain(15000, 1, 10);
      expect(result.baseScore).toBe(0);
      expect(result.minorityBonus).toBe(45);
      expect(result.total).toBe(45);
    });

    it("medium speed, medium minority", () => {
      // Medium speed (5s) + half chose (5/10): 50 + 25 = 75m
      const result = calculateElevationGain(5000, 5, 10);
      expect(result.baseScore).toBe(50);
      expect(result.minorityBonus).toBe(25);
      expect(result.total).toBe(75);
    });
  });

  describe("realistic game scenarios", () => {
    it("fast player in small minority gets huge bonus", () => {
      // 1s response, only 2 out of 20 players chose this
      const result = calculateElevationGain(1000, 2, 20);
      expect(result.baseScore).toBe(90);
      expect(result.minorityBonus).toBe(45); // 90% alone
      expect(result.total).toBe(135);
    });

    it("slow player in majority gets minimal points", () => {
      // 8s response, 15 out of 20 players chose this
      const result = calculateElevationGain(8000, 15, 20);
      expect(result.baseScore).toBe(20);
      expect(result.minorityBonus).toBe(13); // Only 25% alone
      expect(result.total).toBe(33);
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
  it("has expected summit value", () => {
    expect(SUMMIT).toBe(1000);
  });
});

describe("calculateDynamicMax", () => {
  describe("basic rubber-banding", () => {
    it("distributes remaining distance across questions", () => {
      // Leader at 700m, 3 questions left: (1000-700)/3 = 100m
      expect(calculateDynamicMax(700, 3)).toBe(100);
    });

    it("handles even distribution", () => {
      // Leader at 500m, 5 questions left: (1000-500)/5 = 100m
      expect(calculateDynamicMax(500, 5)).toBe(100);
    });

    it("increases cap when many questions remain", () => {
      // Leader at 50m, 10 questions left: (1000-50)/10 = 95m
      expect(calculateDynamicMax(50, 10)).toBe(95);
    });

    it("decreases cap when close to summit", () => {
      // Leader at 900m, 2 questions left: (1000-900)/2 = 50m
      expect(calculateDynamicMax(900, 2)).toBe(50);
    });
  });

  describe("bounds enforcement", () => {
    it("applies minimum cap of 50m", () => {
      // Leader at 950m, 1 question left: (1000-950)/1 = 50m (exactly at floor)
      expect(calculateDynamicMax(950, 1)).toBe(50);

      // Leader at 975m, 1 question left: (1000-975)/1 = 25m -> capped to 50m
      expect(calculateDynamicMax(975, 1)).toBe(50);

      // Leader at 990m, 1 question left: (1000-990)/1 = 10m -> capped to 50m
      expect(calculateDynamicMax(990, 1)).toBe(50);
    });

    it("applies maximum cap of 150m", () => {
      // Leader at 100m, 10 questions left: (1000-100)/10 = 90m (under cap)
      expect(calculateDynamicMax(100, 10)).toBe(90);

      // Leader at 0m, 10 questions left: (1000-0)/10 = 100m (under cap)
      expect(calculateDynamicMax(0, 10)).toBe(100);

      // Leader at 0m, 5 questions left: (1000-0)/5 = 200m -> capped to 150m
      expect(calculateDynamicMax(0, 5)).toBe(150);

      // Leader at 100m, 5 questions left: (1000-100)/5 = 180m -> capped to 150m
      expect(calculateDynamicMax(100, 5)).toBe(150);
    });

    it("stays within 50-150m range", () => {
      const scenarios = [
        { leader: 0, questions: 1 },
        { leader: 500, questions: 5 },
        { leader: 900, questions: 1 },
        { leader: 50, questions: 20 },
        { leader: 950, questions: 2 },
      ];

      scenarios.forEach(({ leader, questions }) => {
        const cap = calculateDynamicMax(leader, questions);
        expect(cap).toBeGreaterThanOrEqual(50);
        expect(cap).toBeLessThanOrEqual(150);
      });
    });
  });

  describe("edge cases", () => {
    it("handles leader at summit", () => {
      // Already at 1000m: distance = 0, should return max cap
      expect(calculateDynamicMax(1000, 5)).toBe(150);
    });

    it("handles leader beyond summit", () => {
      // Above summit (shouldn't happen, but handle gracefully)
      expect(calculateDynamicMax(1050, 5)).toBe(150);
    });

    it("handles 0 questions remaining", () => {
      // Shouldn't happen (reveal happens after answering), but return max
      expect(calculateDynamicMax(500, 0)).toBe(150);
    });

    it("handles negative questions remaining", () => {
      // Edge case: return max cap
      expect(calculateDynamicMax(500, -1)).toBe(150);
    });

    it("handles leader at 0", () => {
      // Start of game: 1000/10 = 100m
      expect(calculateDynamicMax(0, 10)).toBe(100);
    });
  });

  describe("realistic game scenarios", () => {
    it("early game: loose caps allow natural gameplay", () => {
      // Question 1 reveal: leader at ~100m, 9 questions left
      // (1000-100)/9 = 100m
      expect(calculateDynamicMax(100, 9)).toBe(100);
    });

    it("mid game: caps start tightening", () => {
      // Question 5 reveal: leader at 500m, 5 questions left
      // (1000-500)/5 = 100m
      expect(calculateDynamicMax(500, 5)).toBe(100);
    });

    it("late game: tight caps prevent early summiting", () => {
      // Question 8 reveal: leader at 850m, 2 questions left
      // (1000-850)/2 = 75m
      expect(calculateDynamicMax(850, 2)).toBe(75);
    });

    it("final question: minimum cap ensures finish possible", () => {
      // Question 9 reveal: leader at 975m, 1 question left
      // (1000-975)/1 = 25m -> capped to 50m (still allows summit)
      expect(calculateDynamicMax(975, 1)).toBe(50);
    });

    it("runaway leader scenario", () => {
      // Leader far ahead: 800m with 8 questions left
      // (1000-800)/8 = 25m -> capped to 50m (slows them down)
      expect(calculateDynamicMax(800, 8)).toBe(50);
    });

    it("tight race scenario", () => {
      // Close race: leader at 300m with 7 questions left
      // (1000-300)/7 = 100m (normal gameplay)
      expect(calculateDynamicMax(300, 7)).toBe(100);
    });
  });

  describe("rounding behavior", () => {
    it("rounds to nearest integer", () => {
      // 1000-333 = 667, 667/7 = 95.28... -> rounds to 95
      expect(calculateDynamicMax(333, 7)).toBe(95);

      // 1000-250 = 750, 750/7 = 107.14... -> rounds to 107
      expect(calculateDynamicMax(250, 7)).toBe(107);
    });

    it("always returns integer values", () => {
      const scenarios = [
        { leader: 123, questions: 7 },
        { leader: 456, questions: 9 },
        { leader: 789, questions: 3 },
      ];

      scenarios.forEach(({ leader, questions }) => {
        const cap = calculateDynamicMax(leader, questions);
        expect(Number.isInteger(cap)).toBe(true);
      });
    });
  });
});
