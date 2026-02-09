import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("reveal scoring with simplified system", () => {
  test("correct answers get base elevation + speed bonus on reveal", async () => {
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

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Which is correct?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Add 10 players
    const players = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        t.mutation(api.players.join, { sessionId, name: `Player${i + 1}` })
      )
    );

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    // 2 players choose correct answer (A), 8 choose wrong answer (B)
    // Order matters for speed bonus!
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: players[0]!,
      optionIndex: 0, // Correct (first)
    });
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: players[1]!,
      optionIndex: 0, // Correct (second)
    });
    for (let i = 2; i < 10; i++) {
      await t.mutation(api.answers.submit, {
        questionId,
        playerId: players[i]!,
        optionIndex: 1, // Wrong
      });
    }

    // Reveal the answer - this should calculate scores
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Check player elevations
    const p0 = await t.run(async (ctx) => await ctx.db.get(players[0]!));
    const p1 = await t.run(async (ctx) => await ctx.db.get(players[1]!));

    // With 1 question and 10 players:
    // base = 1000 / (1 * 0.75) = 1333m (rounded)
    // bonusCutoff = ceil(10 * 0.20) = 2 players get bonus
    // bonusPool = 1333 * 0.20 = 267m
    // 1st bonus: (2-1+1)/2 * 267 = 267m
    // 2nd bonus: (2-2+1)/2 * 267 = 133m
    // So p0 gets ~1600m, p1 gets ~1466m
    expect(p0!.elevation).toBeGreaterThan(1000);
    expect(p1!.elevation).toBeGreaterThan(1000);
    expect(p0!.elevation).toBeGreaterThan(p1!.elevation); // 1st got bigger bonus

    // Wrong answer players should still be at 0
    const wrongPlayers = await t.run(async (ctx) => {
      const all = await Promise.all(
        players.slice(2).map((id) => ctx.db.get(id!))
      );
      return all;
    });
    for (const wrongPlayer of wrongPlayers) {
      expect(wrongPlayer!.elevation).toBe(0);
    }
  });

  test("player elevations are updated on reveal", async () => {
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

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const player1 = await t.mutation(api.players.join, {
      sessionId,
      name: "Alice",
    });
    const player2 = await t.mutation(api.players.join, {
      sessionId,
      name: "Bob",
    });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    // Both answer correctly
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: player1,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: player2,
      optionIndex: 0,
    });

    // Check elevations before reveal (should still be 0)
    let p1 = await t.run(async (ctx) => await ctx.db.get(player1));
    let p2 = await t.run(async (ctx) => await ctx.db.get(player2));
    expect(p1!.elevation).toBe(0);
    expect(p2!.elevation).toBe(0);

    // Reveal
    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Check elevations after reveal (should be updated)
    p1 = await t.run(async (ctx) => await ctx.db.get(player1));
    p2 = await t.run(async (ctx) => await ctx.db.get(player2));

    // Both get base elevation, 1st gets speed bonus
    expect(p1!.elevation).toBeGreaterThan(0);
    expect(p2!.elevation).toBeGreaterThan(0);
    // First answerer should have higher elevation
    expect(p1!.elevation).toBeGreaterThanOrEqual(p2!.elevation);
  });

  test("speed bonus rewards fast correct answers", async () => {
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

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }, { text: "C" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Add 10 players
    const players = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        t.mutation(api.players.join, { sessionId, name: `P${i + 1}` })
      )
    );

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    // First 5 answer correctly (in order), last 5 wrong
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.answers.submit, {
        questionId,
        playerId: players[i]!,
        optionIndex: 0, // Correct
      });
    }
    for (let i = 5; i < 10; i++) {
      await t.mutation(api.answers.submit, {
        questionId,
        playerId: players[i]!,
        optionIndex: 1, // Wrong
      });
    }

    await t.mutation(api.sessions.revealAnswer, { sessionId, hostId: "test-host" });

    // Get all correct players' elevations
    const correctPlayers = await t.run(async (ctx) => {
      const all = await Promise.all(
        players.slice(0, 5).map((id) => ctx.db.get(id!))
      );
      return all;
    });

    // Top 20% of 10 players = 2 get bonus
    // Player 0 (1st) should have highest elevation (base + max bonus)
    // Player 1 (2nd) should have second highest (base + smaller bonus)
    // Players 2-4 should have base only
    expect(correctPlayers[0]!.elevation).toBeGreaterThan(correctPlayers[1]!.elevation);
    expect(correctPlayers[1]!.elevation).toBeGreaterThan(correctPlayers[2]!.elevation);
    // Players 2, 3, 4 should all have same elevation (just base, no bonus)
    expect(correctPlayers[2]!.elevation).toBe(correctPlayers[3]!.elevation);
    expect(correctPlayers[3]!.elevation).toBe(correctPlayers[4]!.elevation);

    // Wrong answer players should still be at 0
    const wrongPlayers = await t.run(async (ctx) => {
      const all = await Promise.all(
        players.slice(5).map((id) => ctx.db.get(id!))
      );
      return all;
    });
    for (const wrongPlayer of wrongPlayers) {
      expect(wrongPlayer!.elevation).toBe(0);
    }
  });

  test("submit returns submitted:true without calculating elevation", async () => {
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

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.nextQuestion, { sessionId, hostId: "test-host" });
    await t.mutation(api.sessions.showAnswers, { sessionId, hostId: "test-host" });

    const result = await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0,
    });

    // Submit should just acknowledge receipt now
    expect(result).toEqual({ submitted: true });

    // Player elevation should still be 0
    const player = await t.run(async (ctx) => await ctx.db.get(playerId));
    expect(player!.elevation).toBe(0);

    // Answer should be stored without scoring
    const answers = await t.query(api.answers.getByQuestion, { questionId });
    expect(answers.length).toBe(1);
    expect(answers[0]!.baseScore).toBeUndefined();
    expect(answers[0]!.speedBonus).toBeUndefined();
    expect(answers[0]!.elevationGain).toBeUndefined();
  });

  test("custom summit threshold affects scoring", async () => {
    const t = convexTest(schema, modules);

    // Create session with 50% threshold (easier)
    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
      summitThreshold: 0.50,
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

    // Create 2 questions
    const q1 = await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q1",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    await t.mutation(api.questions.create, {
      sessionId,
      hostId: "test-host",
      text: "Q2",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "Player1",
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

    // With 2 questions and 50% threshold:
    // base = 1000 / (2 * 0.50) = 1000m per correct answer
    // Player should summit with just 1 correct answer!
    expect(player!.elevation).toBeGreaterThanOrEqual(1000);
  });
});
