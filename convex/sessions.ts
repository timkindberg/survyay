import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getRandomQuestions } from "./sampleQuestions";
import { calculateElevationGain, calculateDynamicMax, SUMMIT } from "../lib/elevation";

// Generate a random 4-character join code
function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // No I or O to avoid confusion
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const create = mutation({
  args: {
    hostId: v.string(),
  },
  handler: async (ctx, args) => {
    // Generate unique code
    let code = generateCode();
    let existing = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first();

    // Keep generating until we find a unique one
    while (existing) {
      code = generateCode();
      existing = await ctx.db
        .query("sessions")
        .withIndex("by_code", (q) => q.eq("code", code))
        .first();
    }

    // Generate secret token for shareable host link
    const secretToken = crypto.randomUUID();

    const sessionId = await ctx.db.insert("sessions", {
      code,
      hostId: args.hostId,
      secretToken,
      status: "lobby",
      currentQuestionIndex: -1,
      createdAt: Date.now(),
    });

    // Add 10 random sample questions from the question bank
    const sampleQuestions = getRandomQuestions(10);
    for (let i = 0; i < sampleQuestions.length; i++) {
      const question = sampleQuestions[i]!;
      await ctx.db.insert("questions", {
        sessionId,
        text: question.text,
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
        order: i,
        timeLimit: question.timeLimit,
      });
    }

    return { sessionId, code, secretToken };
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();
  },
});

export const getByCodeAndToken = query({
  args: {
    code: v.string(),
    secretToken: v.string(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (!session) return null;

    // Validate secret token matches
    if (session.secretToken !== args.secretToken) return null;

    return session;
  },
});

export const get = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const start = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "lobby") throw new Error("Session already started");

    // Check there's at least one enabled question
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Filter to only enabled questions (undefined or true means enabled)
    const enabledQuestions = questions.filter((q) => q.enabled !== false);

    if (enabledQuestions.length === 0) {
      throw new Error("Add at least one enabled question before starting");
    }

    await ctx.db.patch(args.sessionId, {
      status: "active",
      currentQuestionIndex: -1, // Pre-game hype phase before first question
      questionStartedAt: undefined,
      questionPhase: "pre_game", // New phase for "Game Started" hype moment
    });
  },
});

export const nextQuestion = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Filter to only enabled questions (undefined or true means enabled)
    const enabledQuestions = questions.filter((q) => q.enabled !== false);

    const nextIndex = session.currentQuestionIndex + 1;

    if (nextIndex >= enabledQuestions.length) {
      // No more questions, finish the session
      await ctx.db.patch(args.sessionId, { status: "finished", questionPhase: undefined });
      return { finished: true };
    }

    await ctx.db.patch(args.sessionId, {
      currentQuestionIndex: nextIndex,
      questionStartedAt: Date.now(),
      questionPhase: "question_shown", // Reset to question_shown phase
    });
    return { finished: false };
  },
});

export const finish = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: "finished" });
  },
});

// Get all sessions for a host (not finished)
export const listByHost = query({
  args: { hostId: v.string() },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_hostId", (q) => q.eq("hostId", args.hostId))
      .collect();

    // Filter out finished sessions and sort by creation date (newest first)
    return sessions
      .filter((s) => s.status !== "finished")
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Delete a session and all related data
export const remove = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    // Delete all answers for questions in this session
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const question of questions) {
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_question", (q) => q.eq("questionId", question._id))
        .collect();
      for (const answer of answers) {
        await ctx.db.delete(answer._id);
      }
      await ctx.db.delete(question._id);
    }

    // Delete all players in this session
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const player of players) {
      await ctx.db.delete(player._id);
    }

    // Delete the session itself
    await ctx.db.delete(args.sessionId);
  },
});

// Transition from question_shown to answers_shown (reveals answer options to players)
export const showAnswers = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");
    if (session.questionPhase !== "question_shown") {
      throw new Error("Can only show answers from question_shown phase");
    }

    await ctx.db.patch(args.sessionId, {
      questionPhase: "answers_shown",
    });
  },
});

// Transition to revealed phase (manual host trigger to show correct answer)
// This is when we calculate final scores including minority bonus
export const revealAnswer = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");
    if (session.questionPhase !== "answers_shown") {
      throw new Error("Can only reveal from answers_shown phase");
    }

    // Get the current question
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const enabledQuestions = questions
      .filter((q) => q.enabled !== false)
      .sort((a, b) => a.order - b.order);

    const question = enabledQuestions[session.currentQuestionIndex];
    if (!question) throw new Error("Current question not found");

    // Get all answers for this question
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", question._id))
      .collect();

    // Calculate answer distribution for minority bonus
    const totalAnswered = answers.length;
    const answerCounts = new Map<number, number>();

    for (const answer of answers) {
      const count = answerCounts.get(answer.optionIndex) ?? 0;
      answerCounts.set(answer.optionIndex, count + 1);
    }

    // Find the first answer timestamp for calculating response times
    const firstAnsweredAt = answers.length > 0
      ? Math.min(...answers.map((a) => a.answeredAt))
      : 0;

    // Calculate scores (before applying dynamic cap)
    const scoringResults = new Map<string, { baseScore: number; minorityBonus: number; total: number; isCorrect: boolean }>();

    for (const answer of answers) {
      const isCorrect = question.correctOptionIndex !== undefined
        ? answer.optionIndex === question.correctOptionIndex
        : true; // Poll mode - all answers are "correct"

      if (isCorrect) {
        const answerTime = answer.answeredAt - firstAnsweredAt;
        const playersOnMyLadder = answerCounts.get(answer.optionIndex) ?? 1;
        const scoring = calculateElevationGain(answerTime, playersOnMyLadder, totalAnswered);
        scoringResults.set(answer._id, { ...scoring, isCorrect: true });
      } else {
        scoringResults.set(answer._id, { baseScore: 0, minorityBonus: 0, total: 0, isCorrect: false });
      }
    }

    // Calculate dynamic max elevation cap BEFORE applying gains
    // This ensures we cap based on current state, not future state
    const questionsRemaining = enabledQuestions.length - session.currentQuestionIndex - 1;

    // Get all players for this session
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Find the leading NON-SUMMITED player (exclude players at or above 1000m)
    const nonSummitedPlayers = players.filter((p) => p.elevation < SUMMIT);
    const leaderElevation = nonSummitedPlayers.length > 0
      ? Math.max(...nonSummitedPlayers.map((p) => p.elevation))
      : 0;

    const dynamicMax = calculateDynamicMax(leaderElevation, questionsRemaining);

    // Store dynamic max on the question for debugging
    await ctx.db.patch(question._id, {
      dynamicMaxElevation: dynamicMax,
    });

    // Track players who will summit this turn
    const newSummiters: { playerId: typeof answers[0]["playerId"]; finalElevation: number }[] = [];

    // Apply scores with dynamic cap (but summiters are uncapped for bonus elevation)
    for (const answer of answers) {
      const scoring = scoringResults.get(answer._id);
      if (!scoring) continue;

      if (scoring.isCorrect) {
        const currentElevation = answer.elevationAtAnswer;
        const wasAlreadySummited = currentElevation >= SUMMIT;

        // Summiters are uncapped for bonus elevation, non-summiters get capped
        const cappedGain = wasAlreadySummited
          ? scoring.total // Already summited - no cap, earn bonus
          : Math.min(scoring.total, dynamicMax); // Not yet summited - apply cap

        // Update the answer record with scoring details
        await ctx.db.patch(answer._id, {
          baseScore: scoring.baseScore,
          minorityBonus: scoring.minorityBonus,
          elevationGain: cappedGain,
        });

        // Update player elevation - NO LONGER CAPPED at SUMMIT
        const newElevation = currentElevation + cappedGain;

        await ctx.db.patch(answer.playerId, {
          elevation: newElevation,
        });

        // Track if this player just crossed 1000m this turn
        if (currentElevation < SUMMIT && newElevation >= SUMMIT) {
          newSummiters.push({ playerId: answer.playerId, finalElevation: newElevation });
        }
      } else {
        // Wrong answer - no elevation gain
        await ctx.db.patch(answer._id, {
          baseScore: 0,
          minorityBonus: 0,
          elevationGain: 0,
        });
      }
    }

    // Assign summit places using DENSE RANKING
    if (newSummiters.length > 0) {
      // Count existing summiters to know starting place number
      const existingSummiters = players.filter((p) => p.summitPlace !== undefined);
      const nextPlaceNumber = existingSummiters.length > 0
        ? Math.max(...existingSummiters.map((p) => p.summitPlace!)) + 1
        : 1;

      // Sort new summiters by final elevation (descending)
      newSummiters.sort((a, b) => b.finalElevation - a.finalElevation);

      // Apply DENSE RANKING: same elevation = same place, next different = next place
      let currentPlace = nextPlaceNumber;
      let lastElevation: number | null = null;

      for (const summiter of newSummiters) {
        // If elevation is different from previous, increment place
        if (lastElevation !== null && summiter.finalElevation !== lastElevation) {
          currentPlace++;
        }

        await ctx.db.patch(summiter.playerId, {
          summitPlace: currentPlace,
          summitElevation: summiter.finalElevation,
        });

        lastElevation = summiter.finalElevation;
      }
    }

    await ctx.db.patch(args.sessionId, {
      questionPhase: "revealed",
    });
  },
});

// Transition to results phase (shows detailed stats after reveal)
export const showResults = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");
    if (session.questionPhase !== "revealed") {
      throw new Error("Can only show results from revealed phase");
    }

    await ctx.db.patch(args.sessionId, {
      questionPhase: "results",
    });
  },
});

// Navigate backward through the question phases
// Returns { isDestructive: boolean, targetDescription: string }
export const previousPhase = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Session not active");

    const phase = session.questionPhase;
    const currentIndex = session.currentQuestionIndex;

    // Get enabled questions for reference
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const enabledQuestions = questions
      .filter((q) => q.enabled !== false)
      .sort((a, b) => a.order - b.order);

    const currentQuestion = enabledQuestions[currentIndex];

    // From pre_game -> lobby (safe: no progress to lose)
    if (phase === "pre_game") {
      await ctx.db.patch(args.sessionId, {
        status: "lobby",
        currentQuestionIndex: -1,
        questionStartedAt: undefined,
        questionPhase: undefined,
      });
      return { isDestructive: false, targetDescription: "Lobby" };
    }

    // From results -> revealed (safe: just hide results)
    if (phase === "results") {
      await ctx.db.patch(args.sessionId, { questionPhase: "revealed" });
      return { isDestructive: false, targetDescription: "Revealed" };
    }

    // From revealed -> answers_shown (safe: just un-reveal)
    if (phase === "revealed") {
      await ctx.db.patch(args.sessionId, { questionPhase: "answers_shown" });
      return { isDestructive: false, targetDescription: "Hide Answer" };
    }

    // From answers_shown -> question_shown (DESTRUCTIVE: delete current question's answers)
    if (phase === "answers_shown") {
      if (currentQuestion) {
        // Delete all answers for this question
        const answers = await ctx.db
          .query("answers")
          .withIndex("by_question", (q) => q.eq("questionId", currentQuestion._id))
          .collect();

        // Revert player elevations - for each answer, subtract the elevation gain
        // We can compute the gain by comparing current elevation to elevationAtAnswer
        for (const answer of answers) {
          const player = await ctx.db.get(answer.playerId);
          if (player) {
            // Reset player to their elevation when they grabbed the rope
            await ctx.db.patch(answer.playerId, { elevation: answer.elevationAtAnswer });
          }
        }

        // Now delete the answers
        for (const answer of answers) {
          await ctx.db.delete(answer._id);
        }
      }

      await ctx.db.patch(args.sessionId, { questionPhase: "question_shown" });
      return { isDestructive: true, targetDescription: "Clear Answers" };
    }

    // From question_shown on Q2+ -> previous question's results (safe)
    if (phase === "question_shown" && currentIndex > 0) {
      await ctx.db.patch(args.sessionId, {
        currentQuestionIndex: currentIndex - 1,
        questionPhase: "results",
      });
      return { isDestructive: false, targetDescription: `Q${currentIndex} Results` };
    }

    // From question_shown on Q1 -> pre_game (safe: go back to pre-game hype phase)
    if (phase === "question_shown" && currentIndex === 0) {
      await ctx.db.patch(args.sessionId, {
        currentQuestionIndex: -1,
        questionStartedAt: undefined,
        questionPhase: "pre_game",
      });
      return { isDestructive: false, targetDescription: "Pre-Game" };
    }

    throw new Error("Cannot go back from current state");
  },
});

// Go back to lobby state (from active) to allow editing questions
export const backToLobby = mutation({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "active") throw new Error("Can only go back to lobby from active state");

    // Reset question index and status
    await ctx.db.patch(args.sessionId, {
      status: "lobby",
      currentQuestionIndex: -1,
      questionStartedAt: undefined,
      questionPhase: undefined,
    });

    // Reset all player elevations to 0
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const player of players) {
      await ctx.db.patch(player._id, {
        elevation: 0,
        lastOptionIndex: undefined,
        summitPlace: undefined,
        summitElevation: undefined,
      });
    }

    // Delete all answers for this session's questions
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const question of questions) {
      const answers = await ctx.db
        .query("answers")
        .withIndex("by_question", (q) => q.eq("questionId", question._id))
        .collect();
      for (const answer of answers) {
        await ctx.db.delete(answer._id);
      }
    }
  },
});
