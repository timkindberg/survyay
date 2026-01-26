import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "../../convex/_generated/api";
import schema from "../../convex/schema";
import { Id } from "../../convex/_generated/dataModel";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("Full Session Integration", () => {
  /**
   * Helper to create a session with N questions (using custom questions, not sample ones)
   */
  async function createTestSession(
    t: ReturnType<typeof convexTest>,
    questionCount: number
  ) {
    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Remove the auto-created sample questions
    const existingQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of existingQuestions) {
      await t.mutation(api.questions.remove, { questionId: q._id });
    }

    // Add custom questions with known correct answers
    for (let i = 0; i < questionCount; i++) {
      await t.mutation(api.questions.create, {
        sessionId,
        text: `Question ${i + 1}`,
        options: [
          { text: "Option A" },
          { text: "Option B" },
          { text: "Option C" },
          { text: "Option D" },
        ],
        correctOptionIndex: i % 4, // Rotate correct answer
        timeLimit: 30,
      });
    }

    return sessionId;
  }

  /**
   * Helper to join N players to a session
   */
  async function joinPlayers(
    t: ReturnType<typeof convexTest>,
    sessionId: Id<"sessions">,
    count: number
  ) {
    const playerIds: Id<"players">[] = [];
    for (let i = 0; i < count; i++) {
      const id = await t.mutation(api.players.join, {
        sessionId,
        name: `Player${i + 1}`,
      });
      playerIds.push(id);
    }
    return playerIds;
  }

  it("completes a full 10-question session with 20 players", async () => {
    const t = convexTest(schema, modules);

    // Setup
    const sessionId = await createTestSession(t, 10);
    const playerIds = await joinPlayers(t, sessionId, 20);

    // Start game
    await t.mutation(api.sessions.start, { sessionId });

    let session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("active");
    expect(session?.questionPhase).toBe("question_shown");

    // Get questions
    const questions = await t.query(api.questions.listBySession, { sessionId });
    const enabledQuestions = questions.filter((q) => q.enabled !== false);

    expect(enabledQuestions.length).toBe(10);

    // Play through all questions
    for (let qIndex = 0; qIndex < enabledQuestions.length; qIndex++) {
      const question = enabledQuestions[qIndex]!;
      const correctIndex = question.correctOptionIndex ?? 0;

      // Show answers (transition from question_shown to answers_shown)
      await t.mutation(api.sessions.showAnswers, { sessionId });

      // Verify phase transitioned
      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("answers_shown");

      // Simulate players answering
      for (let pIndex = 0; pIndex < playerIds.length; pIndex++) {
        const playerId = playerIds[pIndex]!;
        // 80% answer correctly, 20% wrong (every 5th player gets it wrong)
        const answerCorrectly = pIndex % 5 !== 0;
        const optionIndex = answerCorrectly
          ? correctIndex
          : (correctIndex + 1) % 4;

        await t.mutation(api.answers.submit, {
          questionId: question._id,
          playerId,
          optionIndex,
        });
      }

      // Verify all players have answered
      const results = await t.query(api.answers.getResults, {
        questionId: question._id,
      });
      expect(results?.totalAnswers).toBe(20);

      // Reveal answer
      await t.mutation(api.sessions.revealAnswer, { sessionId });

      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("revealed");

      // Show results
      await t.mutation(api.sessions.showResults, { sessionId });

      session = await t.query(api.sessions.get, { sessionId });
      expect(session?.questionPhase).toBe("results");

      // Verify leaderboard is sorted
      const leaderboard = await t.query(api.players.getLeaderboard, {
        sessionId,
      });
      for (let i = 1; i < leaderboard.length; i++) {
        expect(leaderboard[i - 1]!.elevation).toBeGreaterThanOrEqual(
          leaderboard[i]!.elevation
        );
      }

      // Next question (if not last)
      if (qIndex < enabledQuestions.length - 1) {
        const nextResult = await t.mutation(api.sessions.nextQuestion, {
          sessionId,
        });
        expect(nextResult.finished).toBe(false);

        // Verify phase reset to question_shown
        session = await t.query(api.sessions.get, { sessionId });
        expect(session?.questionPhase).toBe("question_shown");
        expect(session?.currentQuestionIndex).toBe(qIndex + 1);
      }
    }

    // Final verification
    const finalLeaderboard = await t.query(api.players.getLeaderboard, {
      sessionId,
    });

    // Top player should have gained elevation (10 questions * up to 100m each)
    expect(finalLeaderboard[0]!.elevation).toBeGreaterThan(0);

    // Players who always got it right (pIndex % 5 !== 0) should have higher elevation
    // than players who always got it wrong (pIndex % 5 === 0)
    // Player1 (index 0) always got it wrong, Player2 (index 1) always got it right
    const player1 = finalLeaderboard.find(
      (p) => p._id === playerIds[0]
    );
    const player2 = finalLeaderboard.find(
      (p) => p._id === playerIds[1]
    );

    expect(player1!.elevation).toBe(0); // Always wrong = 0 elevation
    expect(player2!.elevation).toBeGreaterThan(0); // Always right = positive elevation

    // All correct-answerers should have the same elevation (they answered at same speed in tests)
    const correctAnswerers = finalLeaderboard.filter((p) => {
      const idx = playerIds.indexOf(p._id);
      return idx % 5 !== 0;
    });

    // All correct answerers should have elevation = 10 * 100 = 1000 (capped at summit)
    for (const player of correctAnswerers) {
      expect(player.elevation).toBe(1000); // Summit!
    }
  });

  it("rejects answers in wrong phase (question_shown)", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId });

    // Session is in question_shown phase (answers not shown yet)
    const session = await t.query(api.sessions.get, { sessionId });
    expect(session?.questionPhase).toBe("question_shown");

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Try to answer before showAnswers - should fail
    await expect(
      t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId: playerIds[0]!,
        optionIndex: 0,
      })
    ).rejects.toThrow("Answers are not being accepted right now");
  });

  it("rejects answers after reveal phase", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // First player answers
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: 0,
    });

    // Host reveals answer
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    // Second player tries to answer after reveal - should fail
    await expect(
      t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId: playerIds[1]!,
        optionIndex: 0,
      })
    ).rejects.toThrow("Answers are not being accepted right now");
  });

  it("handles player answering twice (duplicate prevention)", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // First answer should succeed
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: 0,
    });

    // Second answer should fail
    await expect(
      t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId: playerIds[0]!,
        optionIndex: 1,
      })
    ).rejects.toThrow("Already answered this question");
  });

  it("calculates elevation correctly for fast vs slow answers", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });
    const correctIndex = questions[0]!.correctOptionIndex!;

    // Both players answer correctly
    const result1 = await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: correctIndex,
    });

    const result2 = await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[1]!,
      optionIndex: correctIndex,
    });

    // First player gets max elevation (100m)
    expect(result1.correct).toBe(true);
    expect(result1.elevationGain).toBe(100);
    expect(result1.newElevation).toBe(100);

    // Second player also gets high elevation (within grace period in tests)
    expect(result2.correct).toBe(true);
    expect(result2.elevationGain).toBeGreaterThanOrEqual(50);
    expect(result2.elevationGain).toBeLessThanOrEqual(100);
  });

  it("wrong answers give zero elevation gain", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });
    const correctIndex = questions[0]!.correctOptionIndex!;
    const wrongIndex = (correctIndex + 1) % 4;

    const result = await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: wrongIndex,
    });

    expect(result.correct).toBe(false);
    expect(result.elevationGain).toBe(0);
    expect(result.newElevation).toBe(0);
  });

  it("maintains leaderboard sorting throughout game", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 5);
    const playerIds = await joinPlayers(t, sessionId, 10);

    await t.mutation(api.sessions.start, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    for (let qIndex = 0; qIndex < questions.length; qIndex++) {
      const question = questions[qIndex]!;
      const correctIndex = question.correctOptionIndex ?? 0;

      await t.mutation(api.sessions.showAnswers, { sessionId });

      // Different players answer correctly/incorrectly to create variety
      for (let pIndex = 0; pIndex < playerIds.length; pIndex++) {
        const playerId = playerIds[pIndex]!;
        // Varying correct answer rates
        const answerCorrectly = pIndex > qIndex; // More players get it right on earlier questions
        const optionIndex = answerCorrectly
          ? correctIndex
          : (correctIndex + 1) % 4;

        await t.mutation(api.answers.submit, {
          questionId: question._id,
          playerId,
          optionIndex,
        });
      }

      await t.mutation(api.sessions.revealAnswer, { sessionId });
      await t.mutation(api.sessions.showResults, { sessionId });

      // Verify leaderboard is properly sorted after each question
      const leaderboard = await t.query(api.players.getLeaderboard, {
        sessionId,
      });
      for (let i = 1; i < leaderboard.length; i++) {
        expect(leaderboard[i - 1]!.elevation).toBeGreaterThanOrEqual(
          leaderboard[i]!.elevation
        );
      }

      if (qIndex < questions.length - 1) {
        await t.mutation(api.sessions.nextQuestion, { sessionId });
      }
    }
  });

  it("poll mode (no correct answer) gives small participation elevation", async () => {
    const t = convexTest(schema, modules);

    const { sessionId } = await t.mutation(api.sessions.create, {
      hostId: "test-host",
    });

    // Remove sample questions
    const existingQuestions = await t.query(api.questions.listBySession, {
      sessionId,
    });
    for (const q of existingQuestions) {
      await t.mutation(api.questions.remove, { questionId: q._id });
    }

    // Create a poll question (no correctOptionIndex)
    await t.mutation(api.questions.create, {
      sessionId,
      text: "What's your favorite color?",
      options: [{ text: "Red" }, { text: "Blue" }, { text: "Green" }],
      // No correctOptionIndex = poll mode
      timeLimit: 30,
    });

    const playerIds = await joinPlayers(t, sessionId, 3);

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // All players answer different options
    const results = [];
    for (let i = 0; i < playerIds.length; i++) {
      const result = await t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId: playerIds[i]!,
        optionIndex: i,
      });
      results.push(result);
    }

    // All should get participation elevation (10m)
    for (const result of results) {
      expect(result.correct).toBe(null); // No "correct" in poll mode
      expect(result.elevationGain).toBe(10); // Small participation bonus
    }
  });

  it("session finishes after last question", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 2);
    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Play through both questions
    for (let i = 0; i < questions.length; i++) {
      await t.mutation(api.sessions.showAnswers, { sessionId });

      for (const playerId of playerIds) {
        await t.mutation(api.answers.submit, {
          questionId: questions[i]!._id,
          playerId,
          optionIndex: 0,
        });
      }

      await t.mutation(api.sessions.revealAnswer, { sessionId });
      await t.mutation(api.sessions.showResults, { sessionId });

      if (i < questions.length - 1) {
        const result = await t.mutation(api.sessions.nextQuestion, {
          sessionId,
        });
        expect(result.finished).toBe(false);
      }
    }

    // Final nextQuestion should finish the session
    const finalResult = await t.mutation(api.sessions.nextQuestion, {
      sessionId,
    });
    expect(finalResult.finished).toBe(true);

    const session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("finished");
  });

  it("players can join mid-game", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 3);

    // Initial players join in lobby
    const initialPlayers = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Play first question
    await t.mutation(api.sessions.showAnswers, { sessionId });
    for (const playerId of initialPlayers) {
      await t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId,
        optionIndex: questions[0]!.correctOptionIndex!,
      });
    }
    await t.mutation(api.sessions.revealAnswer, { sessionId });
    await t.mutation(api.sessions.showResults, { sessionId });
    await t.mutation(api.sessions.nextQuestion, { sessionId });

    // New player joins mid-game (during question 2)
    const lateJoiner = await t.mutation(api.players.join, {
      sessionId,
      name: "LateJoiner",
    });

    // Late joiner should start at 0 elevation
    let player = await t.query(api.players.get, { playerId: lateJoiner });
    expect(player?.elevation).toBe(0);

    // Late joiner can answer current question
    await t.mutation(api.sessions.showAnswers, { sessionId });
    await t.mutation(api.answers.submit, {
      questionId: questions[1]!._id,
      playerId: lateJoiner,
      optionIndex: questions[1]!.correctOptionIndex!,
    });

    // Late joiner should have gained elevation
    player = await t.query(api.players.get, { playerId: lateJoiner });
    expect(player?.elevation).toBeGreaterThan(0);
  });

  it("backToLobby resets all game state", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 3);
    const playerIds = await joinPlayers(t, sessionId, 3);

    await t.mutation(api.sessions.start, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Play first question
    await t.mutation(api.sessions.showAnswers, { sessionId });
    for (const playerId of playerIds) {
      await t.mutation(api.answers.submit, {
        questionId: questions[0]!._id,
        playerId,
        optionIndex: questions[0]!.correctOptionIndex!,
      });
    }

    // Verify players have elevation
    let leaderboard = await t.query(api.players.getLeaderboard, { sessionId });
    expect(leaderboard[0]!.elevation).toBeGreaterThan(0);

    // Go back to lobby
    await t.mutation(api.sessions.backToLobby, { sessionId });

    // Verify session state reset
    const session = await t.query(api.sessions.get, { sessionId });
    expect(session?.status).toBe("lobby");
    expect(session?.currentQuestionIndex).toBe(-1);
    expect(session?.questionPhase).toBeUndefined();

    // Verify player elevations reset
    leaderboard = await t.query(api.players.getLeaderboard, { sessionId });
    for (const player of leaderboard) {
      expect(player.elevation).toBe(0);
    }

    // Verify answers deleted
    for (const question of questions) {
      const hasAnswered = await t.query(api.answers.hasAnswered, {
        questionId: question._id,
        playerId: playerIds[0]!,
      });
      expect(hasAnswered).toBe(false);
    }
  });

  it("getRopeClimbingState returns correct data during gameplay", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 2);
    const playerIds = await joinPlayers(t, sessionId, 4);

    await t.mutation(api.sessions.start, { sessionId });

    // Before showAnswers, state should exist but show question_shown phase
    let state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state).not.toBeNull();
    expect(state!.questionPhase).toBe("question_shown");
    expect(state!.totalPlayers).toBe(4);
    expect(state!.answeredCount).toBe(0);

    await t.mutation(api.sessions.showAnswers, { sessionId });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.questionPhase).toBe("answers_shown");
    expect(state!.timing.isRevealed).toBe(false);

    const questions = await t.query(api.questions.listBySession, { sessionId });
    const correctIndex = questions[0]!.correctOptionIndex!;

    // Players 0 and 1 answer correctly, players 2 and 3 answer wrong
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: correctIndex,
    });
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[1]!,
      optionIndex: correctIndex,
    });
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[2]!,
      optionIndex: (correctIndex + 1) % 4,
    });
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[3]!,
      optionIndex: (correctIndex + 2) % 4,
    });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.answeredCount).toBe(4);
    expect(state!.notAnswered.length).toBe(0);

    // Check rope distribution
    const correctRope = state!.ropes.find((r) => r.optionIndex === correctIndex);
    expect(correctRope!.players.length).toBe(2);
    expect(correctRope!.isCorrect).toBe(true);

    // Reveal
    await t.mutation(api.sessions.revealAnswer, { sessionId });

    state = await t.query(api.answers.getRopeClimbingState, { sessionId });
    expect(state!.questionPhase).toBe("revealed");
    expect(state!.timing.isRevealed).toBe(true);
  });

  it("handles session with disabled questions", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 5);

    // Get all questions
    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Disable questions 2 and 4 (0-indexed)
    await t.mutation(api.questions.setEnabled, {
      questionId: questions[1]!._id,
      enabled: false,
    });
    await t.mutation(api.questions.setEnabled, {
      questionId: questions[3]!._id,
      enabled: false,
    });

    const playerIds = await joinPlayers(t, sessionId, 2);

    await t.mutation(api.sessions.start, { sessionId });

    // Should only need to play through 3 questions (0, 2, 4)
    let questionCount = 0;
    let session = await t.query(api.sessions.get, { sessionId });

    while (session?.status === "active") {
      questionCount++;

      await t.mutation(api.sessions.showAnswers, { sessionId });

      // Get current question
      const currentQuestion = await t.query(api.questions.getCurrentQuestion, {
        sessionId,
      });

      // Answer it
      for (const playerId of playerIds) {
        await t.mutation(api.answers.submit, {
          questionId: currentQuestion!._id,
          playerId,
          optionIndex: 0,
        });
      }

      await t.mutation(api.sessions.revealAnswer, { sessionId });
      await t.mutation(api.sessions.showResults, { sessionId });
      await t.mutation(api.sessions.nextQuestion, { sessionId });

      session = await t.query(api.sessions.get, { sessionId });
    }

    // Only 3 enabled questions were played
    expect(questionCount).toBe(3);
    expect(session?.status).toBe("finished");
  });

  it("elevation caps at summit (1000m)", async () => {
    const t = convexTest(schema, modules);

    // Create enough questions to potentially exceed summit
    const sessionId = await createTestSession(t, 15);
    const playerIds = await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Answer all questions correctly
    for (let i = 0; i < questions.length; i++) {
      await t.mutation(api.sessions.showAnswers, { sessionId });

      const result = await t.mutation(api.answers.submit, {
        questionId: questions[i]!._id,
        playerId: playerIds[0]!,
        optionIndex: questions[i]!.correctOptionIndex!,
      });

      // After 10 correct answers (10 * 100 = 1000), should reach summit
      if (i >= 9) {
        expect(result.reachedSummit).toBe(true);
        expect(result.newElevation).toBe(1000);
      }

      await t.mutation(api.sessions.revealAnswer, { sessionId });
      await t.mutation(api.sessions.showResults, { sessionId });

      if (i < questions.length - 1) {
        await t.mutation(api.sessions.nextQuestion, { sessionId });
      }
    }

    // Final elevation should be capped at 1000
    const player = await t.query(api.players.get, { playerId: playerIds[0]! });
    expect(player?.elevation).toBe(1000);
  });

  it("enforces correct phase transition order", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId });

    // Can't reveal before showing answers
    await expect(
      t.mutation(api.sessions.revealAnswer, { sessionId })
    ).rejects.toThrow("Can only reveal from answers_shown phase");

    // Can't show results before revealing
    await expect(
      t.mutation(api.sessions.showResults, { sessionId })
    ).rejects.toThrow("Can only show results from revealed phase");

    // Correct order works
    await t.mutation(api.sessions.showAnswers, { sessionId });

    // Can't show answers again
    await expect(
      t.mutation(api.sessions.showAnswers, { sessionId })
    ).rejects.toThrow("Can only show answers from question_shown phase");

    await t.mutation(api.sessions.revealAnswer, { sessionId });

    // Can't reveal again
    await expect(
      t.mutation(api.sessions.revealAnswer, { sessionId })
    ).rejects.toThrow("Can only reveal from answers_shown phase");

    await t.mutation(api.sessions.showResults, { sessionId });

    // Can't show results again
    await expect(
      t.mutation(api.sessions.showResults, { sessionId })
    ).rejects.toThrow("Can only show results from revealed phase");
  });

  it("prevents joining finished sessions", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    await joinPlayers(t, sessionId, 1);

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.finish, { sessionId });

    // Try to join finished session
    await expect(
      t.mutation(api.players.join, {
        sessionId,
        name: "LateComer",
      })
    ).rejects.toThrow("Game has ended");
  });

  it("prevents duplicate player names in same session", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);

    await t.mutation(api.players.join, {
      sessionId,
      name: "Alice",
    });

    // Try to join with same name
    await expect(
      t.mutation(api.players.join, {
        sessionId,
        name: "Alice",
      })
    ).rejects.toThrow("Name already taken in this session");
  });

  it("tracks answer timing info correctly", async () => {
    const t = convexTest(schema, modules);

    const sessionId = await createTestSession(t, 1);
    const playerIds = await joinPlayers(t, sessionId, 3);

    await t.mutation(api.sessions.start, { sessionId });
    await t.mutation(api.sessions.showAnswers, { sessionId });

    const questions = await t.query(api.questions.listBySession, { sessionId });

    // Before any answers
    let timingInfo = await t.query(api.answers.getTimingInfo, {
      questionId: questions[0]!._id,
    });
    expect(timingInfo?.firstAnsweredAt).toBeNull();
    expect(timingInfo?.totalAnswers).toBe(0);

    // First answer
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[0]!,
      optionIndex: 0,
    });

    timingInfo = await t.query(api.answers.getTimingInfo, {
      questionId: questions[0]!._id,
    });
    expect(timingInfo?.firstAnsweredAt).not.toBeNull();
    expect(timingInfo?.totalAnswers).toBe(1);

    const firstAnsweredAt = timingInfo!.firstAnsweredAt;

    // More answers
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[1]!,
      optionIndex: 1,
    });
    await t.mutation(api.answers.submit, {
      questionId: questions[0]!._id,
      playerId: playerIds[2]!,
      optionIndex: 2,
    });

    timingInfo = await t.query(api.answers.getTimingInfo, {
      questionId: questions[0]!._id,
    });
    // firstAnsweredAt should remain the same
    expect(timingInfo?.firstAnsweredAt).toBe(firstAnsweredAt);
    expect(timingInfo?.totalAnswers).toBe(3);
  });
});
