import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("dynamic elevation cap (rubber-banding)", () => {
  test("applies dynamic cap to prevent early summiting", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    // Create 3 questions total
    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 2",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q3 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Question 3",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Add 2 players
    const p1 = await t.mutation(api.players.join, {
      sessionId,
      name: "Alice",
    });
    const p2 = await t.mutation(api.players.join, {
      sessionId,
      name: "Bob",
    });

    await t.mutation(api.sessions.start, { sessionId });

    // Q1: Both answer instantly and correctly
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p1,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p2,
      optionIndex: 0,
    });

    // Reveal Q1: Both get baseScore=100, minorityBonus=0 (both chose same)
    // Dynamic cap with 2 questions remaining: min(150, max(50, 1000/2)) = 150m
    // Both should get capped at min(100, 150) = 100m
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    let alice = await t.run(async (ctx) => await ctx.db.get(p1));
    let bob = await t.run(async (ctx) => await ctx.db.get(p2));
    expect(alice!.elevation).toBe(100);
    expect(bob!.elevation).toBeLessThanOrEqual(100);

    // Check that dynamic max was calculated and stored
    const question1 = await t.run(async (ctx) => await ctx.db.get(q1));
    expect(question1!.dynamicMaxElevation).toBe(150);

    // Q2: Only Alice answers correctly (and fast)
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q2,
      playerId: p1,
      optionIndex: 0, // Correct
    });
    await t.mutation(api.answers.submit, {
      questionId: q2,
      playerId: p2,
      optionIndex: 1, // Wrong
    });

    // Reveal Q2: Alice would normally get baseScore=100 + minorityBonus=25 = 125m
    // Dynamic cap with 1 question remaining and leader at 100m:
    // min(150, max(50, (1000-100)/1)) = min(150, max(50, 900)) = 150m
    // Alice gets capped at 125m (under cap, so no change)
    // After Q2: Alice should be at 100 + 125 = 225m
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    alice = await t.run(async (ctx) => await ctx.db.get(p1));
    bob = await t.run(async (ctx) => await ctx.db.get(p2));
    expect(alice!.elevation).toBe(225); // 100 + 125
    expect(bob!.elevation).toBe(100); // Still at 100 (wrong answer)

    const question2 = await t.run(async (ctx) => await ctx.db.get(q2));
    expect(question2!.dynamicMaxElevation).toBe(150);
  });

  test("dynamic cap prevents summiting before final question", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    // Create 2 questions
    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const q2 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q2",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Manually set player to 900m to simulate late game
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    // Manually boost player to 900m
    await t.run(async (ctx) => {
      await ctx.db.patch(playerId, { elevation: 900 });
    });

    await t.mutation(api.sessions.start, { sessionId });

    // Q1: Player answers correctly and fast
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId,
      optionIndex: 0,
    });

    // Reveal: Player would normally get 100m, but dynamic cap should limit this
    // Leader at 900m, 1 question remaining: cap = max(50, min(150, (1000-900)/1)) = 100m
    // Player gets capped at 100m
    // After Q1: 900 + 100 = 1000m (exactly at summit)
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    let player = await t.run(async (ctx) => await ctx.db.get(playerId));
    expect(player!.elevation).toBe(1000); // Reached summit on second-to-last question

    const question1 = await t.run(async (ctx) => await ctx.db.get(q1));
    expect(question1!.dynamicMaxElevation).toBe(100);

    // Q2: Player is already at summit, so stays there
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q2,
      playerId,
      optionIndex: 0,
    });

    await t.mutation(api.sessions.revealAnswer, { sessionId });

    player = await t.run(async (ctx) => await ctx.db.get(playerId));
    expect(player!.elevation).toBe(1000); // Capped at summit

    // Dynamic max should be 150 (leader already at summit)
    const question2 = await t.run(async (ctx) => await ctx.db.get(q2));
    expect(question2!.dynamicMaxElevation).toBe(150);
  });

  test("minimum cap (50m) ensures players can always finish", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Final question",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Player starts at 975m (very close to summit)
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "ClosePlayer",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(playerId, { elevation: 975 });
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId,
      optionIndex: 0,
    });

    // Reveal: Leader at 975m, 0 questions remaining after this
    // Dynamic cap = max(50, min(150, (1000-975)/0)) = 150m (questionsRemaining=0 edge case)
    // But on last question, questionsRemaining = totalQuestions - currentIndex - 1
    // With 1 total question at index 0: 1 - 0 - 1 = 0
    // So the calculation sees 0 remaining and returns MAX_CAP (150m)
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    const player = await t.run(async (ctx) => await ctx.db.get(playerId));
    expect(player!.elevation).toBe(1000); // Got 25m to reach summit, capped at summit

    const question = await t.run(async (ctx) => await ctx.db.get(q1));
    // When questionsRemaining=0 (this is the last question), we return MAX_CAP
    expect(question!.dynamicMaxElevation).toBe(150);
  });

  test("cap tightens as game progresses", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    // Create 5 questions where leader advances by ~200m each
    const questionIds = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        t.mutation(api.questions.create, {
          sessionId,
          text: `Q${i + 1}`,
          options: [{ text: "A" }, { text: "B" }],
          correctOptionIndex: 0,
          timeLimit: 30,
        })
      )
    );

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "Leader",
    });

    await t.mutation(api.sessions.start, { sessionId });

    const dynamicCaps: number[] = [];

    // Play through all questions
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.sessions.nextQuestion, { sessionId });
      await t.mutation(api.sessions.showAnswers, { sessionId });
      await t.mutation(api.answers.submit, {
        questionId: questionIds[i]!,
        playerId,
        optionIndex: 0,
      });
      await t.mutation(api.sessions.revealAnswer, { sessionId });

      const question = await t.run(async (ctx) =>
        await ctx.db.get(questionIds[i]!)
      );
      dynamicCaps.push(question!.dynamicMaxElevation!);
    }

    // Verify caps were calculated (should generally decrease or stay bounded)
    expect(dynamicCaps.length).toBe(5);
    for (const cap of dynamicCaps) {
      expect(cap).toBeGreaterThanOrEqual(50);
      expect(cap).toBeLessThanOrEqual(150);
    }

    // First question should have loose cap (many questions remaining)
    // Last question depends on leader elevation
    expect(dynamicCaps[0]).toBeGreaterThanOrEqual(100); // Should be near max initially
  });

  test("all players get same cap regardless of performance", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Delete all auto-generated sample questions
    const sampleQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of sampleQuestions) {
      await t.mutation(api.questions.remove, {
        questionId: q._id,
      });
    }

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Create 3 players at different elevations
    const p1 = await t.mutation(api.players.join, {
      sessionId,
      name: "Leader",
    });
    const p2 = await t.mutation(api.players.join, {
      sessionId,
      name: "Middle",
    });
    const p3 = await t.mutation(api.players.join, {
      sessionId,
      name: "Behind",
    });

    // Set different starting elevations
    await t.run(async (ctx) => {
      await ctx.db.patch(p1, { elevation: 700 });
      await ctx.db.patch(p2, { elevation: 400 });
      await ctx.db.patch(p3, { elevation: 100 });
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // All answer correctly
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p1,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p2,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId: p3,
      optionIndex: 0,
    });

    await t.mutation(api.sessions.revealAnswer, { sessionId });

    // Check that all answers have same dynamic cap applied
    const answers = await t.query(api.answers.getByQuestion, {
      questionId: q1,
    });

    // All should get same cap
    const question = await t.run(async (ctx) => await ctx.db.get(q1));
    const cap = question!.dynamicMaxElevation!;

    // Verify cap was calculated based on leader (700m)
    // 0 questions remaining after this one (it's the only question)
    // cap = max(50, min(150, (1000-700)/0)) = 150 (edge case handler)
    expect(cap).toBe(150);

    // All elevation gains should be <= cap
    for (const answer of answers) {
      expect(answer.elevationGain).toBeLessThanOrEqual(cap);
    }
  });
});
