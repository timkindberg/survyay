import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

/**
 * Note: Dynamic elevation caps have been REMOVED in the new simplified scoring system.
 * These tests now verify the new scoring behavior:
 * - Base elevation per correct answer = SUMMIT / (totalQuestions * summitThreshold)
 * - First-answerer bonus for top 20% of correct answerers
 * - No speed decay or minority bonus
 */

describe("simplified scoring system (replaces dynamic caps)", () => {
  test("players can summit with correct answer percentage matching threshold", async () => {
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
        hostId: "test-host",
      });
    }

    // Create 4 questions
    const questionIds = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        t.mutation(api.questions.create, {
          sessionId,
          hostId: "test-host",
          text: `Q${i + 1}`,
          options: [{ text: "A" }, { text: "B" }],
          correctOptionIndex: 0,
          timeLimit: 30,
        })
      )
    );

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "Player1",
    });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // Answer 3 of 4 correctly (75% = default threshold)
    // With 4 questions and 75% threshold: base = 1000 / (4 * 0.75) = 333m
    // 3 correct * 333m = ~1000m = summit

    for (let i = 0; i < 3; i++) {
      await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
      await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });
      await t.mutation(api.answers.submit, {
        questionId: questionIds[i]!,
        playerId,
        optionIndex: 0, // Correct
      });
      await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });
    }

    const player = await t.run(async (ctx) => await ctx.db.get(playerId));

    // Player should be at or near summit (allowing for rounding)
    expect(player!.elevation).toBeGreaterThanOrEqual(990);
  });

  test("summit placement works correctly", async () => {
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
        hostId: "test-host",
      });
    }

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Manually set player to 900m to simulate late game
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.run(async (ctx) => {
      await ctx.db.patch(playerId, { elevation: 900 });
    });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });
    await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId,
      optionIndex: 0,
    });

    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    const player = await t.run(async (ctx) => await ctx.db.get(playerId));
    expect(player!.elevation).toBeGreaterThanOrEqual(1000);
    expect(player!.summitPlace).toBe(1);
    expect(player!.summitElevation).toBe(player!.elevation);
  });

  test("base elevation scales with question count", async () => {
    const t = convexTest(schema, modules);

    // Session with many questions should have lower base elevation per question
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
        hostId: "test-host",
      });
    }

    // Create 10 questions (base = 1000 / (10 * 0.75) = 133m)
    const questionIds = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        t.mutation(api.questions.create, {
          sessionId,
          hostId: "test-host",
          text: `Q${i + 1}`,
          options: [{ text: "A" }, { text: "B" }],
          correctOptionIndex: 0,
          timeLimit: 30,
        })
      )
    );

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "Player1",
    });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    // Answer first question correctly
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });
    await t.mutation(api.answers.submit, {
      questionId: questionIds[0]!,
      playerId,
      optionIndex: 0,
    });
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    const player = await t.run(async (ctx) => await ctx.db.get(playerId));

    // With 10 questions and 1 player (getting bonus too):
    // base = 1000 / (10 * 0.75) = 133m (rounded)
    // bonus for 1st: 133 * 0.20 = ~27m
    // Total: ~160m
    expect(player!.elevation).toBeGreaterThan(130);
    expect(player!.elevation).toBeLessThan(200);
  });

  test("dense ranking for summit placement", async () => {
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
        hostId: "test-host",
      });
    }

    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Create 4 players all close to summit
    const p1 = await t.mutation(api.players.join, { sessionId, name: "Player1" });
    const p2 = await t.mutation(api.players.join, { sessionId, name: "Player2" });
    const p3 = await t.mutation(api.players.join, { sessionId, name: "Player3" });
    const p4 = await t.mutation(api.players.join, { sessionId, name: "Player4" });

    // Set elevations so they all summit
    // With 1 question, base = 1333m
    // Fast answerers get bonus, later ones don't
    await t.run(async (ctx) => {
      await ctx.db.patch(p1, { elevation: 0 });
      await ctx.db.patch(p2, { elevation: 0 });
      await ctx.db.patch(p3, { elevation: 0 });
      await ctx.db.patch(p4, { elevation: 0 });
    });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    // All answer correctly in order
    await t.mutation(api.answers.submit, { questionId: q1, playerId: p1, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId: q1, playerId: p2, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId: q1, playerId: p3, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId: q1, playerId: p4, optionIndex: 0 });

    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    const player1 = await t.run(async (ctx) => await ctx.db.get(p1));
    const player2 = await t.run(async (ctx) => await ctx.db.get(p2));
    const player3 = await t.run(async (ctx) => await ctx.db.get(p3));
    const player4 = await t.run(async (ctx) => await ctx.db.get(p4));

    // All should have summited (base alone is 1333m)
    expect(player1!.elevation).toBeGreaterThanOrEqual(1000);
    expect(player2!.elevation).toBeGreaterThanOrEqual(1000);
    expect(player3!.elevation).toBeGreaterThanOrEqual(1000);
    expect(player4!.elevation).toBeGreaterThanOrEqual(1000);

    // First answerer should have highest elevation (got speed bonus)
    expect(player1!.elevation).toBeGreaterThan(player4!.elevation);

    // Check summit placements (should be dense ranked by elevation)
    expect(player1!.summitPlace).toBe(1); // Highest
    // Players 3 and 4 should have same elevation (no bonus) and same place
    expect(player3!.elevation).toBe(player4!.elevation);
    expect(player3!.summitPlace).toBe(player4!.summitPlace);
  });
});

describe("summit threshold configuration", () => {
  test("updateSummitThreshold changes threshold in lobby", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Update threshold to 60%
    await t.mutation(api.sessions.updateSummitThreshold, {
      sessionId,
      hostId: "test-host",
      summitThreshold: 0.60,
    });

    const session = await t.run(async (ctx) => await ctx.db.get(sessionId));
    expect(session!.summitThreshold).toBe(0.60);
  });

  test("updateSummitThreshold rejects invalid values", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Too low
    await expect(
      t.mutation(api.sessions.updateSummitThreshold, {
        sessionId,
        hostId: "test-host",
        summitThreshold: 0.40,
      })
    ).rejects.toThrow("Summit threshold must be between 0.5 and 1.0");

    // Too high
    await expect(
      t.mutation(api.sessions.updateSummitThreshold, {
        sessionId,
        hostId: "test-host",
        summitThreshold: 1.5,
      })
    ).rejects.toThrow("Summit threshold must be between 0.5 and 1.0");
  });

  test("updateSummitThreshold only works in lobby", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });

    await expect(
      t.mutation(api.sessions.updateSummitThreshold, {
        sessionId,
        hostId: "test-host",
        summitThreshold: 0.60,
      })
    ).rejects.toThrow("Can only change summit threshold in lobby");
  });
});
