import { convexTest } from "convex-test";
import { expect, test, describe } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("answers.submit", () => {
  test("first correct answer gets full elevation (100m)", async () => {
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

    // Start the session (this sets currentQuestionIndex to -1 and phase to pre_game)
    await t.mutation(api.sessions.start, { sessionId });
    // Move to first question (sets currentQuestionIndex to 0 and phase to question_shown)
    await t.mutation(api.sessions.nextQuestion, { sessionId });

    // Show answers (transition to answers_shown phase to accept answers)
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Submit correct answer - first player should get full elevation
    const result = await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 1, // Correct answer
    });

    expect(result.correct).toBe(true);
    expect(result.elevationGain).toBe(100); // First answer always gets max
    expect(result.newElevation).toBe(100);
  });

  test("subsequent correct answers get elevation based on time from first answer", async () => {
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

    // Add two players
    const player1 = await t.mutation(api.players.join, {
      sessionId,
      name: "FastPlayer",
    });
    const player2 = await t.mutation(api.players.join, {
      sessionId,
      name: "SlowPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // First player answers - gets full elevation
    const result1 = await t.mutation(api.answers.submit, {
      questionId,
      playerId: player1,
      optionIndex: 1,
    });

    expect(result1.correct).toBe(true);
    expect(result1.elevationGain).toBe(100); // First answer = max elevation

    // Second player answers immediately after - should still get high elevation
    // (within grace period since mutations run quickly in tests)
    const result2 = await t.mutation(api.answers.submit, {
      questionId,
      playerId: player2,
      optionIndex: 1,
    });

    expect(result2.correct).toBe(true);
    // Second player's time is calculated from first player's answer
    // In tests, mutations run almost instantly so should still get max or close to max
    expect(result2.elevationGain).toBeGreaterThanOrEqual(50); // At least floor
    expect(result2.elevationGain).toBeLessThanOrEqual(100); // At most max
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
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

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
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

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
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

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
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Answer first question correctly
    const result1 = await t.mutation(api.answers.submit, {
      questionId: q1,
      playerId,
      optionIndex: 0,
    });

    expect(result1.correct).toBe(true);
    const firstElevation = result1.newElevation;

    // Move to next question (this resets phase to question_shown)
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

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
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

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
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

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

describe("answers.getTimingInfo", () => {
  test("returns null firstAnsweredAt when no answers", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      timeLimit: 20,
    });

    const timingInfo = await t.query(api.answers.getTimingInfo, { questionId });

    expect(timingInfo).not.toBeNull();
    expect(timingInfo!.firstAnsweredAt).toBeNull();
    expect(timingInfo!.timeLimit).toBe(20);
    expect(timingInfo!.totalAnswers).toBe(0);
  });

  test("returns firstAnsweredAt after first answer", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 15,
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Submit an answer
    await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0,
    });

    const timingInfo = await t.query(api.answers.getTimingInfo, { questionId });

    expect(timingInfo).not.toBeNull();
    expect(timingInfo!.firstAnsweredAt).not.toBeNull();
    expect(typeof timingInfo!.firstAnsweredAt).toBe("number");
    expect(timingInfo!.timeLimit).toBe(15);
    expect(timingInfo!.totalAnswers).toBe(1);
  });
});

describe("answers.isQuestionOpen", () => {
  test("returns true when no answers yet", async () => {
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

    const isOpen = await t.query(api.answers.isQuestionOpen, { questionId });

    expect(isOpen).toBe(true);
  });

  test("returns true immediately after first answer", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Test?",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30, // 30 seconds - plenty of time
    });

    const playerId = await t.mutation(api.players.join, {
      sessionId,
      name: "TestPlayer",
    });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    await t.mutation(api.answers.submit, {
      questionId,
      playerId,
      optionIndex: 0,
    });

    // Should still be open right after answering
    const isOpen = await t.query(api.answers.isQuestionOpen, { questionId });

    expect(isOpen).toBe(true);
  });
});

describe("answers.getPlayersOnRopes", () => {
  test("groups players by their answer choice", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Pick a letter",
      options: [{ text: "A" }, { text: "B" }, { text: "C" }, { text: "D" }],
      correctOptionIndex: 1,
      timeLimit: 30,
    });

    // Add 4 players
    const player1 = await t.mutation(api.players.join, { sessionId, name: "Alice" });
    const player2 = await t.mutation(api.players.join, { sessionId, name: "Bob" });
    const player3 = await t.mutation(api.players.join, { sessionId, name: "Charlie" });
    const player4 = await t.mutation(api.players.join, { sessionId, name: "Diana" });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Players answer different options (Alice and Charlie pick A, Bob picks B, Diana doesn't answer)
    await t.mutation(api.answers.submit, { questionId, playerId: player1, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId, playerId: player2, optionIndex: 1 });
    await t.mutation(api.answers.submit, { questionId, playerId: player3, optionIndex: 0 });

    const result = await t.query(api.answers.getPlayersOnRopes, { questionId });

    expect(result).not.toBeNull();
    expect(result!.ropes.length).toBe(4); // 4 options = 4 ropes

    // Rope A (index 0) should have Alice and Charlie
    expect(result!.ropes[0]!.length).toBe(2);
    expect(result!.ropes[0]!.map((p) => p.playerName).sort()).toEqual(["Alice", "Charlie"]);

    // Rope B (index 1) should have Bob
    expect(result!.ropes[1]!.length).toBe(1);
    expect(result!.ropes[1]![0]!.playerName).toBe("Bob");

    // Ropes C and D should be empty
    expect(result!.ropes[2]!.length).toBe(0);
    expect(result!.ropes[3]!.length).toBe(0);

    // Diana hasn't answered
    expect(result!.notAnswered.length).toBe(1);
    expect(result!.notAnswered[0]!.playerName).toBe("Diana");

    expect(result!.correctOptionIndex).toBe(1);
  });

  test("includes elevationAtAnswer for players on ropes", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Get the auto-created questions (sessions.create adds sample questions)
    const questions = await t.query(api.questions.listBySession, { sessionId });
    expect(questions.length).toBeGreaterThan(1); // Should have sample questions

    const q1 = questions[0]!;
    const q2 = questions[1]!;

    const playerId = await t.mutation(api.players.join, { sessionId, name: "TestPlayer" });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Answer first question correctly to gain elevation
    // Sample questions have correctOptionIndex set
    const result1 = await t.mutation(api.answers.submit, {
      questionId: q1._id,
      playerId,
      optionIndex: q1.correctOptionIndex!, // Use the correct answer
    });

    expect(result1.correct).toBe(true);
    expect(result1.newElevation).toBe(100); // First correct answer = 100m

    // Move to next question (resets phase to question_shown)
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Answer second question (wrong answer)
    await t.mutation(api.answers.submit, {
      questionId: q2._id,
      playerId,
      optionIndex: (q2.correctOptionIndex! + 1) % q2.options.length, // Pick wrong answer
    });

    // Check the rope state
    const ropeState = await t.query(api.answers.getPlayersOnRopes, { questionId: q2._id });

    expect(ropeState).not.toBeNull();
    // Player should be on the rope for the wrong answer
    const wrongIndex = (q2.correctOptionIndex! + 1) % q2.options.length;
    expect(ropeState!.ropes[wrongIndex]!.length).toBe(1);
    // Player should have their elevation (100m) recorded at time of answer
    expect(ropeState!.ropes[wrongIndex]![0]!.elevationAtAnswer).toBe(100);
  });

  test("sorts players on rope by answeredAt (earliest first)", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    const questionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Test",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const player1 = await t.mutation(api.players.join, { sessionId, name: "First" });
    const player2 = await t.mutation(api.players.join, { sessionId, name: "Second" });
    const player3 = await t.mutation(api.players.join, { sessionId, name: "Third" });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // All pick option A, but in order
    await t.mutation(api.answers.submit, { questionId, playerId: player1, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId, playerId: player2, optionIndex: 0 });
    await t.mutation(api.answers.submit, { questionId, playerId: player3, optionIndex: 0 });

    const result = await t.query(api.answers.getPlayersOnRopes, { questionId });

    expect(result).not.toBeNull();
    // Should be sorted by answeredAt (First answered first, so should be first in array)
    expect(result!.ropes[0]!.map((p) => p.playerName)).toEqual(["First", "Second", "Third"]);
  });

  test("returns null for non-existent question", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Create a question just to get a valid-looking ID format
    const realQuestionId = await t.mutation(api.questions.create, {
      sessionId,
      text: "Real",
      options: [{ text: "A" }],
      timeLimit: 30,
    });

    // Delete it to make it non-existent
    await t.mutation(api.questions.remove, { questionId: realQuestionId });

    const result = await t.query(api.answers.getPlayersOnRopes, { questionId: realQuestionId });
    expect(result).toBeNull();
  });
});

describe("answers.getRopeClimbingState", () => {
  test("returns complete state for current question", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Get the auto-created questions (sessions.create adds sample questions)
    const questions = await t.query(api.questions.listBySession, { sessionId });
    const firstQuestion = questions[0]!;

    const player1 = await t.mutation(api.players.join, { sessionId, name: "Alice" });
    const player2 = await t.mutation(api.players.join, { sessionId, name: "Bob" });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Alice answers the first question (with correct answer)
    await t.mutation(api.answers.submit, {
      questionId: firstQuestion._id,
      playerId: player1,
      optionIndex: firstQuestion.correctOptionIndex!,
    });

    const state = await t.query(api.answers.getRopeClimbingState, { sessionId });

    expect(state).not.toBeNull();
    expect(state!.question.text).toBe(firstQuestion.text);
    expect(state!.question.timeLimit).toBe(firstQuestion.timeLimit);
    expect(state!.ropes.length).toBe(firstQuestion.options.length);
    // Check the correct answer rope
    const correctRope = state!.ropes[firstQuestion.correctOptionIndex!]!;
    expect(correctRope.isCorrect).toBe(true);
    expect(correctRope.players.length).toBe(1);
    expect(correctRope.players[0]!.playerName).toBe("Alice");
    expect(state!.notAnswered.length).toBe(1);
    expect(state!.notAnswered[0]!.playerName).toBe("Bob");
    expect(state!.totalPlayers).toBe(2);
    expect(state!.answeredCount).toBe(1);
    expect(state!.timing.firstAnsweredAt).not.toBeNull();
    expect(state!.timing.timeLimit).toBe(firstQuestion.timeLimit);
  });

  test("returns null when no active question", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Session is in lobby, no current question
    const state = await t.query(api.answers.getRopeClimbingState, { sessionId });

    expect(state).toBeNull();
  });

  test("tracks timing correctly", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Test",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    const playerId = await t.mutation(api.players.join, { sessionId, name: "TestPlayer" });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Before any answers
    let state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.timing.firstAnsweredAt).toBeNull();
    expect(state!.timing.isExpired).toBe(false);

    // Get the current question ID from the state
    const questionId = state!.question.id;

    // After answering
    await t.mutation(api.answers.submit, {
      questionId: questionId as any, // Cast needed since it's a string in the state
      playerId,
      optionIndex: 0,
    });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.timing.firstAnsweredAt).not.toBeNull();
    expect(state!.timing.isExpired).toBe(false); // Should not be expired immediately
  });

  test("isRevealed is true when phase is revealed", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Test",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30, // 30 seconds - timer won't expire during test
    });

    // Add 3 players
    const player1 = await t.mutation(api.players.join, { sessionId, name: "Alice" });
    const player2 = await t.mutation(api.players.join, { sessionId, name: "Bob" });
    const player3 = await t.mutation(api.players.join, { sessionId, name: "Charlie" });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Get the current question ID
    let state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    const questionId = state!.question.id;

    // Initially not revealed (phase is answers_shown)
    expect(state!.timing.isRevealed).toBe(false);
    expect(state!.questionPhase).toBe("answers_shown");

    // All players answer
    await t.mutation(api.answers.submit, {
      questionId: questionId as any,
      playerId: player1,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId: questionId as any,
      playerId: player2,
      optionIndex: 1,
    });
    await t.mutation(api.answers.submit, {
      questionId: questionId as any,
      playerId: player3,
      optionIndex: 0,
    });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.answeredCount).toBe(3);
    expect(state!.totalPlayers).toBe(3);
    // Still NOT revealed until host triggers it
    expect(state!.timing.isRevealed).toBe(false);
    expect(state!.questionPhase).toBe("answers_shown");

    // Host reveals the answer
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.timing.isRevealed).toBe(true);
    expect(state!.questionPhase).toBe("revealed");
  });

  test("questionPhase controls reveal, not activePlayerCount", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Test",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Add 3 players
    const player1 = await t.mutation(api.players.join, { sessionId, name: "Alice" });
    const player2 = await t.mutation(api.players.join, { sessionId, name: "Bob" });
    const player3 = await t.mutation(api.players.join, { sessionId, name: "Charlie" });

    // Charlie's tab is "closed" - explicitly disconnect them
    await t.mutation(api.players.disconnect, { playerId: player3 });

    // Alice and Bob send heartbeats (though they're already active from joining)
    await t.mutation(api.players.heartbeat, { playerId: player1 });
    await t.mutation(api.players.heartbeat, { playerId: player2 });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    let state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    const questionId = state!.question.id;

    // Check that activePlayerCount is 2 (only Alice and Bob have heartbeats)
    expect(state!.totalPlayers).toBe(3);
    expect(state!.activePlayerCount).toBe(2);
    expect(state!.timing.isRevealed).toBe(false);
    expect(state!.questionPhase).toBe("answers_shown");

    // Both active players answer
    await t.mutation(api.answers.submit, {
      questionId: questionId as any,
      playerId: player1,
      optionIndex: 0,
    });
    await t.mutation(api.answers.submit, {
      questionId: questionId as any,
      playerId: player2,
      optionIndex: 1,
    });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.answeredCount).toBe(2);
    expect(state!.activePlayerCount).toBe(2);
    // NOT revealed yet - host controls reveal via phase
    expect(state!.timing.isRevealed).toBe(false);
    expect(state!.questionPhase).toBe("answers_shown");

    // Host reveals
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.timing.isRevealed).toBe(true);
    expect(state!.questionPhase).toBe("revealed");
  });

  test("results phase also sets isRevealed to true", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    await t.mutation(api.questions.create, {
      sessionId,
      text: "Test",
      options: [{ text: "A" }, { text: "B" }],
      correctOptionIndex: 0,
      timeLimit: 30,
    });

    // Add a player
    const player1 = await t.mutation(api.players.join, { sessionId, name: "Alice" });

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    let state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    const questionId = state!.question.id;

    // Answer
    await t.mutation(api.answers.submit, {
      questionId: questionId as any,
      playerId: player1,
      optionIndex: 0,
    });

    // Reveal
    await t.mutation(api.sessions.revealAnswer, { sessionId });
    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.timing.isRevealed).toBe(true);
    expect(state!.questionPhase).toBe("revealed");

    // Show results
    await t.mutation(api.sessions.showResults, { sessionId });
    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.timing.isRevealed).toBe(true);
    expect(state!.questionPhase).toBe("results");
  });
});

