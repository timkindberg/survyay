import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("reveal scoring with minority bonus", () => {
  test("correct answers get base score + minority bonus on reveal", async () => {
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

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
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

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // 2 players choose correct answer (A), 8 choose wrong answer (B)
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
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    // Check player elevations (most reliable way to verify scoring worked)
    const p0 = await t.run(async (ctx) => await ctx.db.get(players[0]!));
    const p1 = await t.run(async (ctx) => await ctx.db.get(players[1]!));

    // Both correct players chose option 0, so 2 out of 10 total answered
    // aloneRatio = 1 - (2/10) = 0.8
    // minorityBonus = 0.8 * 50 = 40m

    // Player 0 answered first (0ms delay): baseScore=125, minorityBonus=40, total=165
    expect(p0!.elevation).toBe(165);

    // Player 1 answered second (tiny delay in tests): baseScore ~125, minorityBonus=40, total ~165
    expect(p1!.elevation).toBeGreaterThan(125);
    expect(p1!.elevation).toBeLessThanOrEqual(165);

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
      });
    }

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
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

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

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
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    // Check elevations after reveal (should be updated)
    p1 = await t.run(async (ctx) => await ctx.db.get(player1));
    p2 = await t.run(async (ctx) => await ctx.db.get(player2));

    // Both chose the same answer, so no minority bonus (2/2 = 0% alone)
    // Player 1: baseScore=125 (instant), minorityBonus=0, total=125
    expect(p1!.elevation).toBe(125);

    // Player 2: baseScore ~= 125 (almost instant in tests), minorityBonus=0
    expect(p2!.elevation).toBeGreaterThan(0);
    expect(p2!.elevation).toBeLessThanOrEqual(125);
  });

  test("minority bonus rewards diversity correctly", async () => {
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

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }, { text: "C" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Add 6 players
    const players = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        t.mutation(api.players.join, { sessionId, name: `P${i + 1}` })
      )
    );

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // 1 player chooses A (correct), 3 choose B (wrong), 2 choose C (wrong)
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: players[0]!,
      optionIndex: 0, // Correct + alone
    });
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: players[1]!,
      optionIndex: 1, // Wrong
    });
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: players[2]!,
      optionIndex: 1, // Wrong
    });
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: players[3]!,
      optionIndex: 1, // Wrong
    });
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: players[4]!,
      optionIndex: 2, // Wrong
    });
    await t.mutation(api.answers.submit, {
      questionId,
      playerId: players[5]!,
      optionIndex: 2, // Wrong
    });

    await t.mutation(api.sessions.revealAnswer, { sessionId });

    // Check the correct player's elevation
    const p0 = await t.run(async (ctx) => await ctx.db.get(players[0]!));

    // 1 out of 6 chose this: aloneRatio = 1 - (1/6) ≈ 0.833
    // minorityBonus = 0.833 * 50 ≈ 42m
    // baseScore = 125 (first answer)
    // total = 125 + 42 = 167m
    expect(p0!.elevation).toBe(167);

    // Wrong answer players should still be at 0
    const wrongPlayers = await t.run(async (ctx) => {
      const all = await Promise.all(
        players.slice(1).map((id) => ctx.db.get(id!))
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
      });
    }

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

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
    expect(answers[0]!.minorityBonus).toBeUndefined();
    expect(answers[0]!.elevationGain).toBeUndefined();
  });
});
