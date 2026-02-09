import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import {
  getRandomQuestions,
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  getQuestionCountByCategory,
  getTotalQuestionCount,
  type QuestionCategory,
} from "./sampleQuestions";
import { calculateElevationGain, SUMMIT, DEFAULT_SUMMIT_THRESHOLD } from "../lib/elevation";
import { getEnabledQuestions } from "./helpers";

// Validator for question categories
const categoryValidator = v.union(
  v.literal("pop_culture"),
  v.literal("science"),
  v.literal("history"),
  v.literal("geography"),
  v.literal("sports"),
  v.literal("music"),
  v.literal("movies_tv"),
  v.literal("food_drink"),
  v.literal("technology"),
  v.literal("programming"),
  v.literal("animals"),
  v.literal("literature"),
  v.literal("general")
);

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
    categories: v.optional(v.array(categoryValidator)),
    questionCount: v.optional(v.number()),
    summitThreshold: v.optional(v.number()), // 0-1, percentage of correct answers needed to summit
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
      summitThreshold: args.summitThreshold, // Will be undefined if not provided (defaults to 0.75)
      createdAt: Date.now(),
    });

    // Add random sample questions from the question bank
    const count = args.questionCount ?? 10;
    const categories = args.categories as QuestionCategory[] | undefined;
    const sampleQuestions = getRandomQuestions(count, categories);
    for (let i = 0; i < sampleQuestions.length; i++) {
      const question = sampleQuestions[i]!;
      await ctx.db.insert("questions", {
        sessionId,
        text: question.text,
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
        order: i,
        timeLimit: question.timeLimit ?? 30,
        followUpText: question.followUpText,
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
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    if (session.status !== "lobby") throw new Error("Session already started");

    // Check there's at least one enabled question
    const enabledQuestions = await getEnabledQuestions(ctx, args.sessionId);

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
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    if (session.status !== "active") throw new Error("Session not active");

    const enabledQuestions = await getEnabledQuestions(ctx, args.sessionId);

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
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    await ctx.db.patch(args.sessionId, { status: "finished" });
  },
});

// End game early - admin can finish the game at any point during active gameplay
export const endGameEarly = mutation({
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    if (session.status !== "active") {
      throw new Error("Can only end an active game");
    }

    // Set status to finished and clear question phase
    await ctx.db.patch(args.sessionId, {
      status: "finished",
      questionPhase: undefined,
    });
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
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");

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
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
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
// This is when we calculate final scores using simplified scoring:
// - Base elevation = SUMMIT / (totalQuestions * summitThreshold)
// - First-answerer bonus = top 20% of correct answerers get linear bonus from 20% bonus pool
export const revealAnswer = mutation({
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    if (session.status !== "active") throw new Error("Session not active");
    if (session.questionPhase !== "answers_shown") {
      throw new Error("Can only reveal from answers_shown phase");
    }

    // Get the current question
    const enabledQuestions = await getEnabledQuestions(ctx, args.sessionId);

    const question = enabledQuestions[session.currentQuestionIndex];
    if (!question) throw new Error("Current question not found");

    // Get all answers for this question
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", question._id))
      .collect();

    // Get all players for this session (for total player count)
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const totalPlayers = players.length;
    const totalQuestions = enabledQuestions.length;
    const summitThreshold = session.summitThreshold ?? DEFAULT_SUMMIT_THRESHOLD;

    // Identify correct answers and sort by answer time
    const correctAnswers = answers
      .filter((a) => {
        const isCorrect = question.correctOptionIndex !== undefined
          ? a.optionIndex === question.correctOptionIndex
          : true; // Poll mode - all answers are "correct"
        return isCorrect;
      })
      .sort((a, b) => a.answeredAt - b.answeredAt);

    // Create a map of answer position for correct answers (1-indexed)
    const answerPositions = new Map<string, number>();
    correctAnswers.forEach((a, index) => {
      answerPositions.set(a._id, index + 1);
    });

    // Track players who will summit this turn
    const newSummiters: { playerId: typeof answers[0]["playerId"]; finalElevation: number }[] = [];

    // Calculate and apply scores
    for (const answer of answers) {
      const isCorrect = question.correctOptionIndex !== undefined
        ? answer.optionIndex === question.correctOptionIndex
        : true; // Poll mode

      if (isCorrect) {
        const answerPosition = answerPositions.get(answer._id) ?? 1;
        const scoring = calculateElevationGain(
          true,
          answerPosition,
          totalPlayers,
          totalQuestions,
          summitThreshold
        );

        // Update the answer record with scoring details
        await ctx.db.patch(answer._id, {
          baseScore: scoring.base,
          speedBonus: scoring.bonus,
          elevationGain: scoring.total,
        });

        // Update player elevation
        const currentElevation = answer.elevationAtAnswer;
        const newElevation = currentElevation + scoring.total;

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
          speedBonus: 0,
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
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
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
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    if (session.status !== "active") throw new Error("Session not active");

    const phase = session.questionPhase;
    const currentIndex = session.currentQuestionIndex;

    // Get enabled questions for reference
    const enabledQuestions = await getEnabledQuestions(ctx, args.sessionId);

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

// Go back to lobby state (from active or finished) to allow editing questions
export const backToLobby = mutation({
  args: { sessionId: v.id("sessions"), hostId: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    if (session.status !== "active" && session.status !== "finished") {
      throw new Error("Can only go back to lobby from active or finished state");
    }

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

// Regenerate questions for a session (only works in lobby state)
export const regenerateQuestions = mutation({
  args: {
    sessionId: v.id("sessions"),
    hostId: v.string(),
    categories: v.optional(v.array(categoryValidator)),
    questionCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    if (session.status !== "lobby") {
      throw new Error("Can only regenerate questions in lobby state");
    }

    // Delete existing questions
    const existingQuestions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const question of existingQuestions) {
      await ctx.db.delete(question._id);
    }

    // Add new random questions
    const count = args.questionCount ?? 10;
    const categories = args.categories as QuestionCategory[] | undefined;
    const sampleQuestions = getRandomQuestions(count, categories);

    for (let i = 0; i < sampleQuestions.length; i++) {
      const question = sampleQuestions[i]!;
      await ctx.db.insert("questions", {
        sessionId: args.sessionId,
        text: question.text,
        options: question.options,
        correctOptionIndex: question.correctOptionIndex,
        order: i,
        timeLimit: question.timeLimit ?? 30,
        followUpText: question.followUpText,
      });
    }

    return { count: sampleQuestions.length };
  },
});

// Get category metadata for UI
export const getCategoryInfo = query({
  args: {},
  handler: async () => {
    return {
      categories: ALL_CATEGORIES,
      labels: CATEGORY_LABELS,
      counts: getQuestionCountByCategory(),
      total: getTotalQuestionCount(),
    };
  },
});

// Update summit threshold for a session (only in lobby)
export const updateSummitThreshold = mutation({
  args: {
    sessionId: v.id("sessions"),
    hostId: v.string(),
    summitThreshold: v.number(), // 0-1, percentage of correct answers needed to summit
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (args.hostId !== session.hostId) throw new Error("Unauthorized: not the session host");
    if (session.status !== "lobby") {
      throw new Error("Can only change summit threshold in lobby");
    }

    // Validate threshold is between 0.5 and 1.0
    if (args.summitThreshold < 0.5 || args.summitThreshold > 1.0) {
      throw new Error("Summit threshold must be between 0.5 and 1.0");
    }

    await ctx.db.patch(args.sessionId, {
      summitThreshold: args.summitThreshold,
    });
  },
});
