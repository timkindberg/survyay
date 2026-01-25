import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("answers.submit", () => {
  test("correct answer grants elevation based on speed", async () => {
    const t = convexTest(schema, modules);

    // Create a session
    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Add a question with correct answer
    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "What is 2+2?",
      options: [{ text: "3" }, { text: "4" }, { text: "5" }],
      correctOptionIndex: 1,
      timeLimit: 30,
    });

    // Add a player (join uses sessionId directly)
    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    // Start the session (this sets currentQuestionIndex to 0)
    await t.mutation(api.sessions.start, { sessionId });

    // Submit correct answer
    const result = await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 1, // Correct answer
    });

    expect(result.correct).toBe(true);
    expect(result.elevationGain).toBeGreaterThan(0);
    expect(result.newElevation).toBeGreaterThan(0);
  });

  test("wrong answer gives no elevation", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "What is 2+2?",
      options: [{ text: "3" }, { text: "4" }, { text: "5" }],
      correctOptionIndex: 1,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });

    // Submit wrong answer
    const result = await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0, // Wrong answer
    });

    expect(result.correct).toBe(false);
    expect(result.elevationGain).toBe(0);
    expect(result.newElevation).toBe(0);
  });

  test("cannot answer same question twice", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "What is 2+2?",
      options: [{ text: "3" }, { text: "4" }],
      correctOptionIndex: 1,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });

    // First answer
    await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 1,
    });

    // Second answer should fail
    await expect(
      t.mutation(api.answers.submit, {
        questionId,
        playerId,
        optionIndex: 0,
      })
    ).rejects.toThrowError("Already answered this question");
  });

  test("poll mode (no correct answer) gives small elevation", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Question without correctOptionIndex = poll mode
    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Favorite color?",
      options: [{ text: "Red" }, { text: "Blue" }],
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });

    const result = await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0,
    });

    expect(result.correct).toBe(null);
    expect(result.elevationGain).toBe(10); // Small participation bonus
    expect(result.newElevation).toBe(10);
  });

  test("elevation accumulates across multiple correct answers", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Add two questions
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
      options: [{ text: "X" }, { text: "Y" }],
      correctOptionIndex: 1,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });

    // Answer first question correctly
    const result1 = await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId,
      optionIndex: 0,
    });

    expect(result1.correct).toBe(true);
    const firstElevation = result1.newElevation;

    // Move to next question
    await t.mutation(api.sessions.nextQuestion, { sessionId });

    // Answer second question correctly
    const result2 = await t.mutation(api.answers.submit, {
      questionId: q2,
      playerId,
      optionIndex: 1,
    });

    expect(result2.correct).toBe(true);
    expect(result2.newElevation).toBeGreaterThan(firstElevation);
  });
});

describe("answers.hasAnswered", () => {
  test("returns false before answering", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    const hasAnswered = await t.query(api.answers.hasAnswered, {
      questionId,
      playerId,
    });

    expect(hasAnswered).toBe(false);
  });

  test("returns true after answering", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

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

    await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0,
    });

    const hasAnswered = await t.query(api.answers.hasAnswered, {
      questionId,
      playerId,
    });

    expect(hasAnswered).toBe(true);
  });
});

describe("answers.getResults", () => {
  test("aggregates votes per option", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Favorite?",
      options: [{ text: "A" }, { text: "B" }, { text: "C" }],
      correctOptionIndex: 1,
      timeLimit: 30,
    });

    // Add 3 players
    const player1 = await t.mutation(api.players.join, { sessionId, name: "P1" });
    const player2 = await t.mutation(api.players.join, { sessionId, name: "P2" });
    const player3 = await t.mutation(api.players.join, { sessionId, name: "P3" });

    await t.mutation(api.sessions.start, { sessionId });

    // P1 and P2 vote for option 0, P3 votes for option 1
    await t.mutation(api.answers.submit, { questionId, playerId: player1, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId, playerId: player2, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId, playerId: player3, optionIndex: 1 });

    const results = await t.query(api.answers.getResults, { questionId });

    expect(results).not.toBeNull();
    expect(results!.totalAnswers).toBe(3);
    expect(results!.optionCounts).toEqual([2, 1, 0]); // 2 for A, 1 for B, 0 for C
    expect(results!.correctOptionIndex).toBe(1);
  });

});

