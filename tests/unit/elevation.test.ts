import { describe, it, expect } from "vitest";
import {
  calculateElevationGain,
  calculateBaseScore,
  calculateMinorityBonus,
  calculateMaxPerQuestion,
  applyElevationGain,
  hasReachedSummit,
  calculateDynamicMax,
  SUMMIT,
} from "../../lib/elevation";

describe("calculateMaxPerQuestion", () => {
  describe("scales max elevation based on question count", () => {
    it("returns ~182m for 10 questions (summit at 55% = 5.5 questions)", () => {
      // 1000 / (10 * 0.55) = 1000 / 5.5 = 181.82
      const max = calculateMaxPerQuestion(10);
      expect(max).toBeCloseTo(181.82, 1);
    });

    it("returns ~91m for 20 questions (summit at 55% = 11 questions)", () => {
      // 1000 / (20 * 0.55) = 1000 / 11 = 90.91
      const max = calculateMaxPerQuestion(20);
      expect(max).toBeCloseTo(90.91, 1);
    });

    it("returns ~40m for 45 questions (summit at 55% = 24.75 questions)", () => {
      // 1000 / (45 * 0.55) = 1000 / 24.75 = 40.40
      const max = calculateMaxPerQuestion(45);
      expect(max).toBeCloseTo(40.40, 1);
    });

    it("returns default max (175m) for 0 or negative questions", () => {
      expect(calculateMaxPerQuestion(0)).toBe(175);
      expect(calculateMaxPerQuestion(-5)).toBe(175);
    });
  });
});

describe("calculateBaseScore", () => {
  describe("legacy behavior (no totalQuestions)", () => {
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

  describe("scaled behavior (with totalQuestions)", () => {
    it("scales base score for 10 questions", () => {
      // With 55%: maxPerQuestion = 1000/(10*0.55) = 181.82
      // baseMax = 181.82 * (125/175) = 129.87
      const instant = calculateBaseScore(0, 10);
      expect(instant).toBe(130); // ~130m for instant answer

      const fiveSeconds = calculateBaseScore(5000, 10);
      expect(fiveSeconds).toBe(65); // ~65m for 5s answer (half of max)

      const tenSeconds = calculateBaseScore(10000, 10);
      expect(tenSeconds).toBe(0); // 0m for 10s answer
    });

    it("scales base score for 45 questions", () => {
      // With 55%: maxPerQuestion = 1000/(45*0.55) = 40.40
      // baseMax = 40.40 * (125/175) = 28.86
      const instant = calculateBaseScore(0, 45);
      expect(instant).toBe(29); // ~29m for instant answer

      const fiveSeconds = calculateBaseScore(5000, 45);
      expect(fiveSeconds).toBe(14); // ~14m for 5s answer

      const tenSeconds = calculateBaseScore(10000, 45);
      expect(tenSeconds).toBe(0); // 0m for 10s answer
    });

    it("handles edge case of 0 totalQuestions (uses default)", () => {
      expect(calculateBaseScore(0, 0)).toBe(125); // Falls back to default
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
  describe("legacy behavior (no totalQuestions)", () => {
    it("gives max bonus (45m) when nearly alone (1/10)", () => {
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

  describe("scaled behavior (with totalQuestions)", () => {
    it("scales minority bonus for 10 questions", () => {
      // With 55%: maxPerQuestion = 1000/(10*0.55) = 181.82
      // bonusMax = 181.82 * (50/175) = 51.95
      // 1/10 players: aloneRatio = 0.9, bonus = 0.9 * 51.95 = 46.75 -> 47
      expect(calculateMinorityBonus(1, 10, 10)).toBe(47);

      // 5/10 players: aloneRatio = 0.5, bonus = 0.5 * 51.95 = 25.97 -> 26
      expect(calculateMinorityBonus(5, 10, 10)).toBe(26);

      // 10/10 players: aloneRatio = 0.0, bonus = 0
      expect(calculateMinorityBonus(10, 10, 10)).toBe(0);
    });

    it("scales minority bonus for 45 questions", () => {
      // With 55%: maxPerQuestion = 1000/(45*0.55) = 40.40
      // bonusMax = 40.40 * (50/175) = 11.54
      // 1/10 players: aloneRatio = 0.9, bonus = 0.9 * 11.54 = 10.39 -> 10
      expect(calculateMinorityBonus(1, 10, 45)).toBe(10);

      // 5/10 players: aloneRatio = 0.5, bonus = 0.5 * 11.54 = 5.77 -> 6
      expect(calculateMinorityBonus(5, 10, 45)).toBe(6);
    });

    it("handles edge case of 0 totalQuestions (uses default)", () => {
      expect(calculateMinorityBonus(1, 10, 0)).toBe(45); // Falls back to default
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
  describe("legacy combined scoring (no totalQuestions)", () => {
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

  describe("scaled combined scoring (with totalQuestions)", () => {
    it("scales down for 45 questions - fast answer alone", () => {
      // With 55%: maxPerQuestion = 40.40m
      // Fast answer (0s) + alone (1/10): 29 + 10 = 39m
      const result = calculateElevationGain(0, 1, 10, 45);
      expect(result.baseScore).toBe(29);
      expect(result.minorityBonus).toBe(10);
      expect(result.total).toBe(39);
    });

    it("scales appropriately for 10 questions - fast answer alone", () => {
      // With 55%: maxPerQuestion = 181.82m
      // Fast answer (0s) + alone (1/10): 130 + 47 = 177m
      const result = calculateElevationGain(0, 1, 10, 10);
      expect(result.baseScore).toBe(130);
      expect(result.minorityBonus).toBe(47);
      expect(result.total).toBe(177);
    });

    it("ensures summit reachable at 55% with perfect answers (45 questions)", () => {
      // With 45 questions, target is ~25 perfect answers to summit
      // Max per question ≈ 40.40m
      // 25 perfect answers * 40.40m = ~1010m (slightly over 1000)
      const maxPerQuestion = calculateMaxPerQuestion(45);
      const targetQuestions = Math.ceil(45 * 0.55); // 25 questions
      const totalElevation = maxPerQuestion * targetQuestions;
      expect(totalElevation).toBeGreaterThanOrEqual(SUMMIT);
      expect(totalElevation).toBeLessThan(SUMMIT * 1.05); // Within 5% over
    });

    it("ensures summit reachable at 55% with perfect answers (10 questions)", () => {
      // With 10 questions, target is ~6 perfect answers to summit
      const maxPerQuestion = calculateMaxPerQuestion(10);
      const targetQuestions = Math.ceil(10 * 0.55); // 6 questions
      const totalElevation = maxPerQuestion * targetQuestions;
      expect(totalElevation).toBeGreaterThanOrEqual(SUMMIT);
      expect(totalElevation).toBeLessThan(SUMMIT * 1.15); // Within 15% over
    });
  });

  describe("realistic game scenarios (legacy)", () => {
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

  describe("game pacing scenarios", () => {
    it("45-question game summit progression with perfect base score only", () => {
      // Simulate getting perfect BASE scores (instant answers) over ALL questions
      // Using majority group (no minority bonus) to test base score alone
      let elevation = 0;

      for (let i = 0; i < 45; i++) {
        // Perfect answer: instant (0ms), majority (10/10 = no minority bonus)
        const gain = calculateElevationGain(0, 10, 10, 45);
        elevation += gain.total;
      }

      // With 55% target and only base scores (71% of max), 45 questions gives:
      // 45 * 29 = 1305m (exceeds summit)
      // This validates that perfect base score alone CAN reach summit in longer games
      expect(elevation).toBeGreaterThan(SUMMIT);
      expect(elevation).toBeLessThan(SUMMIT * 1.4); // Should be within 40% over
    });

    it("45-question game summit progression with full scoring", () => {
      // Simulate perfect answers (instant + minority) over 55% of questions
      // Max per question for 45 questions ≈ 40.40m
      let elevation = 0;
      const questionsForSummit = Math.ceil(45 * 0.55); // 25 questions

      for (let i = 0; i < questionsForSummit; i++) {
        // Max scoring: instant (0ms), truly alone (1/1 still gives 0 bonus though)
        // Use 1/10 for realistic minority bonus
        const gain = calculateElevationGain(0, 1, 10, 45);
        elevation += gain.total;
      }

      // 25 questions * 39m each ≈ 975m - close to summit
      // With full scoring they should be at or near summit
      expect(elevation).toBeGreaterThan(SUMMIT * 0.95); // Should be within 5% of summit
    });

    it("10-question game summit progression", () => {
      // With 10 questions, expect summit around question 6
      let elevation = 0;
      const questionsForSummit = Math.ceil(10 * 0.55); // 6 questions

      for (let i = 0; i < questionsForSummit; i++) {
        // Max scoring: instant answer, good minority position
        const gain = calculateElevationGain(0, 1, 10, 10);
        elevation += gain.total;
      }

      expect(elevation).toBeGreaterThanOrEqual(SUMMIT);
    });

    it("validates max per question scales correctly", () => {
      // For 45 questions: 1000 / (45 * 0.55) = 40.40m max
      // 55% of 45 = 24.75, ceiling to 25 questions
      // 25 * 40.40 = 1010m >= 1000m summit
      const maxPerQuestion = calculateMaxPerQuestion(45);
      const targetQuestions = 45 * 0.55;
      expect(maxPerQuestion * targetQuestions).toBeCloseTo(SUMMIT, 0);
    });

    it("ANALYSIS: find optimal target percentage WITHOUT rubber-banding", () => {
      // Test WITHOUT rubber-banding to see raw formula impact
      // Simulates realistic top player: 75% correct, 3s avg, 40% minority

      const targetPercentages = [0.66, 0.55, 0.50, 0.45, 0.40, 0.35];

      console.log("\n📊 TARGET % ANALYSIS (NO rubber-banding):");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Scenario: 75% correct, 3s response, 40% minority");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      for (const targetPct of targetPercentages) {
        let elevation = 0;
        const totalQuestions = 45;
        const correctAnswers = Math.floor(45 * 0.75); // 34 correct

        // Calculate max per question for this target
        const maxPerQuestion = SUMMIT / (totalQuestions * targetPct);
        const baseMax = maxPerQuestion * (125 / 175);
        const bonusMax = maxPerQuestion * (50 / 175);

        for (let i = 0; i < correctAnswers; i++) {
          const inMinority = i % 5 < 2; // 40% minority
          const responseTimeFactor = 0.7; // 3 seconds
          const baseScore = Math.round(baseMax * responseTimeFactor);

          const playersOnCorrect = inMinority ? 10 : 25;
          const aloneRatio = (50 - playersOnCorrect) / 50;
          const minorityBonus = Math.round(bonusMax * aloneRatio);

          elevation += baseScore + minorityBonus;
        }

        const summits = elevation >= SUMMIT;
        const status = summits ? "✅" : "❌";
        console.log(`  ${(targetPct * 100).toFixed(0)}%: ${elevation}m (${Math.round(elevation/10)}%) ${status}`);
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      // Now test WITH rubber-banding
      console.log("\n📊 TARGET % ANALYSIS (WITH rubber-banding):");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Scenario: 75% correct, 3s response, 40% minority");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

      for (const targetPct of targetPercentages) {
        let elevation = 0;
        let summitQ: number | null = null;
        const totalQuestions = 45;

        // Simulate question by question with rubber-banding
        const isCorrect = (q: number) => q % 4 !== 3; // 75% correct

        for (let q = 0; q < totalQuestions; q++) {
          if (elevation >= SUMMIT) break; // Stop at summit

          if (!isCorrect(q)) continue; // Skip wrong answers

          const questionsRemaining = totalQuestions - q - 1;
          const distanceToSummit = SUMMIT - elevation;

          // Rubber-band boost: if behind pace, increase max
          const baseMax = SUMMIT / (totalQuestions * targetPct);
          const boostCap = questionsRemaining > 0
            ? distanceToSummit / (questionsRemaining * targetPct)
            : baseMax;
          const dynamicMax = Math.max(baseMax, boostCap);

          const baseScoreMax = dynamicMax * (125 / 175);
          const bonusScoreMax = dynamicMax * (50 / 175);

          const inMinority = q % 5 < 2;
          const responseTimeFactor = 0.7;
          const baseScore = Math.round(baseScoreMax * responseTimeFactor);

          const playersOnCorrect = inMinority ? 10 : 25;
          const aloneRatio = (50 - playersOnCorrect) / 50;
          const minorityBonus = Math.round(bonusScoreMax * aloneRatio);

          elevation += baseScore + minorityBonus;

          if (elevation >= SUMMIT && summitQ === null) {
            summitQ = q + 1;
          }
        }

        const status = summitQ ? `✅ Q${summitQ}` : "❌";
        console.log(`  ${(targetPct * 100).toFixed(0)}%: ${Math.min(elevation, SUMMIT + 100)}m ${status}`);
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      expect(true).toBe(true); // Analysis test always passes
    });

    it("ANALYSIS: pessimistic scenario comparison", () => {
      // 66% correct, 4s response, 20% minority
      const targetPercentages = [0.66, 0.55, 0.50, 0.45, 0.40, 0.35];

      console.log("\n📊 PESSIMISTIC SCENARIO (66% correct, 4s, 20% minority):");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("Without rubber-banding:");

      for (const targetPct of targetPercentages) {
        let elevation = 0;
        const correctAnswers = Math.floor(45 * 0.66); // 30 correct

        const maxPerQuestion = SUMMIT / (45 * targetPct);
        const baseMax = maxPerQuestion * (125 / 175);
        const bonusMax = maxPerQuestion * (50 / 175);

        for (let i = 0; i < correctAnswers; i++) {
          const inMinority = i % 5 === 0; // 20% minority
          const responseTimeFactor = 0.6; // 4 seconds
          const baseScore = Math.round(baseMax * responseTimeFactor);

          const playersOnCorrect = inMinority ? 10 : 30;
          const aloneRatio = (50 - playersOnCorrect) / 50;
          const minorityBonus = Math.round(bonusMax * aloneRatio);

          elevation += baseScore + minorityBonus;
        }

        const status = elevation >= SUMMIT ? "✅" : "❌";
        console.log(`  ${(targetPct * 100).toFixed(0)}%: ${elevation}m (${Math.round(elevation/10)}%) ${status}`);
      }

      console.log("\nWith rubber-banding:");

      for (const targetPct of targetPercentages) {
        let elevation = 0;
        let summitQ: number | null = null;

        const isCorrect = (q: number) => q % 3 !== 2; // 66% correct

        for (let q = 0; q < 45; q++) {
          if (elevation >= SUMMIT) break;
          if (!isCorrect(q)) continue;

          const questionsRemaining = 45 - q - 1;
          const distanceToSummit = SUMMIT - elevation;

          const baseMax = SUMMIT / (45 * targetPct);
          const boostCap = questionsRemaining > 0
            ? distanceToSummit / (questionsRemaining * targetPct)
            : baseMax;
          const dynamicMax = Math.max(baseMax, boostCap);

          const baseScoreMax = dynamicMax * (125 / 175);
          const bonusScoreMax = dynamicMax * (50 / 175);

          const inMinority = q % 5 === 0;
          const baseScore = Math.round(baseScoreMax * 0.6);

          const playersOnCorrect = inMinority ? 10 : 30;
          const aloneRatio = (50 - playersOnCorrect) / 50;
          const minorityBonus = Math.round(bonusScoreMax * aloneRatio);

          elevation += baseScore + minorityBonus;

          if (elevation >= SUMMIT && summitQ === null) {
            summitQ = q + 1;
          }
        }

        const status = summitQ ? `✅ Q${summitQ}` : "❌";
        console.log(`  ${(targetPct * 100).toFixed(0)}%: ${Math.min(elevation, SUMMIT + 100)}m ${status}`);
      }
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

      expect(true).toBe(true);
    });

    it("average player reaches mid-mountain in 45-question game", () => {
      // Simulate average player in 50-player game:
      // - Gets 70% of answers correct
      // - Average 4 second response time
      // - Usually in majority when correct (30/50 picked correct)
      let elevation = 0;
      const correctAnswers = Math.floor(45 * 0.7); // 31 correct answers

      for (let i = 0; i < correctAnswers; i++) {
        // Average player: 4 second response, in majority (30/50 = 60% picked correct)
        const gain = calculateElevationGain(4000, 30, 50, 45);
        elevation += gain.total;
      }

      // Average player reaches ~550m (mid-mountain) - not summit, but good progress
      // This creates nice spread between top performers and average players
      expect(elevation).toBeGreaterThan(SUMMIT * 0.5);
      expect(elevation).toBeLessThan(SUMMIT * 0.7);
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
    it("boosts when slightly behind pace", () => {
      // Leader at 700m, 3 questions left: (1000-700)/(3*0.55) = 182m > 175 -> returns 182
      expect(calculateDynamicMax(700, 3)).toBe(182);
    });

    it("boosts for even distribution", () => {
      // Leader at 500m, 5 questions left: (1000-500)/(5*0.55) = 182m > 175 -> returns 182
      expect(calculateDynamicMax(500, 5)).toBe(182);
    });

    it("returns floor when many questions remain and ahead of pace", () => {
      // Leader at 50m, 10 questions left: (1000-50)/(10*0.55) = 173m < 175 -> returns 175
      expect(calculateDynamicMax(50, 10)).toBe(175);
    });

    it("returns floor for typical late game", () => {
      // Leader at 900m, 2 questions left: (1000-900)/(2*0.55) = 91m < 175 -> returns 175
      expect(calculateDynamicMax(900, 2)).toBe(175);
    });

    it("boosts above 175m when catch-up needed", () => {
      // Leader at 500m, 2 questions left: (1000-500)/(2*0.55) = 455m > 175 -> returns 455
      expect(calculateDynamicMax(500, 2)).toBe(455);

      // Leader at 300m, 2 questions left: (1000-300)/(2*0.55) = 636m > 175 -> returns 636
      expect(calculateDynamicMax(300, 2)).toBe(636);

      // Leader at 0m, 4 questions left: 1000/(4*0.55) = 455m > 175 -> returns 455
      expect(calculateDynamicMax(0, 4)).toBe(455);
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
      // Start of short game: 1000/(4*0.55) = 455m (boost)
      expect(calculateDynamicMax(0, 4)).toBe(455);
    });

    it("handles leader at 0 with many questions", () => {
      // Start of long game: 1000/(10*0.55) = 182m > 175 -> 182
      expect(calculateDynamicMax(0, 10)).toBe(182);
    });
  });

  describe("realistic game scenarios", () => {
    it("early game: boost if behind pace", () => {
      // Question 1 reveal: leader at ~100m, 9 questions left
      // (1000-100)/(9*0.55) = 182m > 175 -> returns 182
      expect(calculateDynamicMax(100, 9)).toBe(182);
    });

    it("mid game: boost if behind pace", () => {
      // Question 5 reveal: leader at 500m, 5 questions left
      // (1000-500)/(5*0.55) = 182m > 175 -> returns 182
      expect(calculateDynamicMax(500, 5)).toBe(182);
    });

    it("late game with tight race: 175m floor maintained", () => {
      // Question 8 reveal: leader at 850m, 2 questions left
      // (1000-850)/(2*0.55) = 136m < 175 -> returns 175
      expect(calculateDynamicMax(850, 2)).toBe(175);
    });

    it("final question: 175m floor ensures easy summit", () => {
      // Question 9 reveal: leader at 975m, 1 question left
      // (1000-975)/(1*0.55) = 45m < 175 -> returns 175 (easy summit)
      expect(calculateDynamicMax(975, 1)).toBe(175);
    });

    it("catch-up scenario: boost above 175m", () => {
      // Leader very far ahead: everyone else far behind
      // If non-summited leader is at 200m with 2 questions left
      // (1000-200)/(2*0.55) = 727m > 175 -> returns 727 (major boost)
      expect(calculateDynamicMax(200, 2)).toBe(727);
    });
  });

  describe("rounding behavior", () => {
    it("rounds to nearest integer", () => {
      // 1000-333 = 667, 667/(3*0.55) = 404 -> rounds to 404
      expect(calculateDynamicMax(333, 3)).toBe(404);

      // 1000-250 = 750, 750/(3*0.55) = 455 -> returns 455
      expect(calculateDynamicMax(250, 3)).toBe(455);
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
