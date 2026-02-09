import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { calculateElevationGain, SUMMIT } from "../lib/elevation";
import { PRESENCE_TIMEOUT_MS } from "../lib/constants";
import type { PlayerOnRope, QuestionPhase, RopeClimbingState } from "../lib/ropeTypes";
import { getEnabledQuestions } from "./helpers";

export const submit = mutation({
  args: {
    questionId: v.id("questions"),
    playerId: v.id("players"),
    optionIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    // Validate optionIndex is within bounds
    if (
      !Number.isInteger(args.optionIndex) ||
      args.optionIndex < 0 ||
      args.optionIndex >= question.options.length
    ) {
      throw new Error(
        `Invalid option index: must be 0-${question.options.length - 1}`
      );
    }

    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found");

    // Get the session to check the question phase
    const session = await ctx.db.get(question.sessionId);
    if (!session) throw new Error("Session not found");

    // Only accept answers during the answers_shown phase
    const questionPhase = session.questionPhase ?? "answers_shown"; // backward compatibility
    if (questionPhase !== "answers_shown") {
      throw new Error("Answers are not being accepted right now");
    }

    // Check if already answered
    const existing = await ctx.db
      .query("answers")
      .withIndex("by_question_and_player", (q) =>
        q.eq("questionId", args.questionId).eq("playerId", args.playerId)
      )
      .first();

    if (existing) {
      throw new Error("Already answered this question");
    }

    const answeredAt = Date.now();

    // Get all existing answers for this question to find the first answer
    const existingAnswers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .collect();

    // Check if timer has expired (only if there are existing answers)
    if (existingAnswers.length > 0) {
      const firstAnsweredAt = Math.min(...existingAnswers.map((a) => a.answeredAt));
      const elapsed = answeredAt - firstAnsweredAt;
      const timeLimitMs = question.timeLimit * 1000;
      if (elapsed >= timeLimitMs) {
        throw new Error("Time's up! Answer not accepted.");
      }
    }

    // Calculate answer time based on first answer (or 0 if this is the first)
    let answerTime: number;
    if (existingAnswers.length === 0) {
      // This is the first answer - they get full elevation (time delta = 0)
      answerTime = 0;
    } else {
      // Find the earliest answeredAt timestamp
      const firstAnsweredAt = Math.min(...existingAnswers.map((a) => a.answeredAt));
      answerTime = answeredAt - firstAnsweredAt;
    }

    // Store the player's current elevation (where they grabbed the rope)
    const currentElevation = player.elevation ?? 0;

    await ctx.db.insert("answers", {
      questionId: args.questionId,
      playerId: args.playerId,
      optionIndex: args.optionIndex,
      answeredAt,
      elevationAtAnswer: currentElevation,
    });

    // Cache the last option index on the player for column positioning
    await ctx.db.patch(args.playerId, {
      lastOptionIndex: args.optionIndex,
    });

    // NOTE: Elevation is now calculated during reveal phase to include minority bonus
    // Just acknowledge the answer was received
    return {
      submitted: true,
    };
  },
});

export const getByQuestion = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .collect();
  },
});

export const getByPlayer = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("answers")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
  },
});

export const hasAnswered = query({
  args: {
    questionId: v.id("questions"),
    playerId: v.id("players"),
  },
  handler: async (ctx, args) => {
    const answer = await ctx.db
      .query("answers")
      .withIndex("by_question_and_player", (q) =>
        q.eq("questionId", args.questionId).eq("playerId", args.playerId)
      )
      .first();

    return answer !== null;
  },
});

export const getResults = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return null;

    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .collect();

    // Count votes per option
    const counts: number[] = question.options.map(() => 0);
    for (const answer of answers) {
      const idx = answer.optionIndex;
      if (idx >= 0 && idx < counts.length) {
        counts[idx] = (counts[idx] ?? 0) + 1;
      }
    }

    return {
      totalAnswers: answers.length,
      optionCounts: counts,
      correctOptionIndex: question.correctOptionIndex,
    };
  },
});

// Get player answers with their chosen option index for displaying on ropes
export const getPlayerAnswers = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .collect();

    // Return player answers with elevation at time of answer
    return answers.map((a) => ({
      playerId: a.playerId,
      optionIndex: a.optionIndex,
      elevationAtAnswer: a.elevationAtAnswer ?? 0,
    }));
  },
});

// Get timing info for a question (firstAnsweredAt and timeLimit)
export const getTimingInfo = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return null;

    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .collect();

    // Find the first answer timestamp
    const firstAnsweredAt =
      answers.length > 0
        ? Math.min(...answers.map((a) => a.answeredAt))
        : null;

    return {
      firstAnsweredAt,
      timeLimit: question.timeLimit,
      totalAnswers: answers.length,
    };
  },
});

// Check if a question is still accepting answers (timer not expired)
export const isQuestionOpen = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return false;

    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .collect();

    // If no answers yet, question is open
    if (answers.length === 0) return true;

    // Find the first answer timestamp
    const firstAnsweredAt = Math.min(...answers.map((a) => a.answeredAt));
    const now = Date.now();
    const elapsed = now - firstAnsweredAt;
    const timeLimitMs = question.timeLimit * 1000;

    return elapsed < timeLimitMs;
  },
});

/**
 * Result of getPlayersOnRopes query
 */
export interface PlayersOnRopesResult {
  ropes: PlayerOnRope[][]; // One array per answer option
  notAnswered: PlayerOnRope[]; // Players who haven't answered yet
  options: { text: string }[]; // Answer option texts
  correctOptionIndex: number | undefined; // Which rope is correct (if quiz mode)
}

/**
 * Get players grouped by their answer choice for rope visualization.
 * Returns players on each rope (one per answer option) plus players who haven't answered.
 */
export const getPlayersOnRopes = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args): Promise<PlayersOnRopesResult | null> => {
    const question = await ctx.db.get(args.questionId);
    if (!question) return null;

    // Get all players in the session
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", question.sessionId))
      .collect();

    // Get all answers for this question
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .collect();

    // Build answer lookup map (playerId -> answer)
    const answerMap = new Map(answers.map((a) => [a.playerId, a]));

    // Initialize rope arrays (one per option)
    const ropes: PlayerOnRope[][] = question.options.map(() => []);
    const notAnswered: PlayerOnRope[] = [];

    // Group players by their answer
    for (const player of players) {
      const answer = answerMap.get(player._id);
      if (answer) {
        // Player has answered - add to appropriate rope
        const ropePlayer: PlayerOnRope = {
          playerId: player._id,
          playerName: player.name,
          elevationAtAnswer: answer.elevationAtAnswer,
          answeredAt: answer.answeredAt,
          elevationGain: answer.elevationGain, // Populated after reveal
        };
        if (answer.optionIndex >= 0 && answer.optionIndex < ropes.length) {
          ropes[answer.optionIndex]!.push(ropePlayer);
        }
      } else {
        // Player hasn't answered yet
        notAnswered.push({
          playerId: player._id,
          playerName: player.name,
          elevationAtAnswer: player.elevation ?? 0,
          answeredAt: 0,
        });
      }
    }

    // Sort each rope by answeredAt (earlier answers = higher on rope)
    for (const rope of ropes) {
      rope.sort((a, b) => a.answeredAt - b.answeredAt);
    }

    return {
      ropes,
      notAnswered,
      options: question.options,
      correctOptionIndex: question.correctOptionIndex,
    };
  },
});

// QuestionPhase, PlayerOnRope, and RopeClimbingState types are imported from lib/ropeTypes.ts

/**
 * Get complete rope climbing state for the Mountain visualization.
 * This is the main query for the frontend animation component.
 */
export const getRopeClimbingState = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args): Promise<RopeClimbingState | null> => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (session.currentQuestionIndex < 0) return null;

    // Get the current question
    const enabledQuestions = await getEnabledQuestions(ctx, args.sessionId);

    const question = enabledQuestions[session.currentQuestionIndex];
    if (!question) return null;

    // Get all players in the session
    const players = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Get all answers for this question
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", question._id))
      .collect();

    // Build answer lookup map (playerId -> answer)
    const answerMap = new Map(answers.map((a) => [a.playerId, a]));

    // Get the question phase from the session (default to "answers_shown" for backward compatibility)
    const questionPhase = (session.questionPhase ?? "answers_shown") as QuestionPhase;

    // Calculate timing - only applies when answers are shown
    const firstAnsweredAt =
      questionPhase !== "question_shown" && answers.length > 0
        ? Math.min(...answers.map((a) => a.answeredAt))
        : null;

    const now = Date.now();
    const isExpired =
      firstAnsweredAt !== null &&
      now - firstAnsweredAt >= question.timeLimit * 1000;

    // Calculate active players (those with recent heartbeat)
    const totalPlayers = players.length;
    const activePlayerCount = players.filter(
      (p) => p.lastSeenAt !== undefined && now - p.lastSeenAt < PRESENCE_TIMEOUT_MS
    ).length;
    const answeredCount = answers.length;

    // Reveal is determined by the question phase (host controls it)
    // The "revealed" and "results" phases both mean the answer is revealed
    const isRevealed = questionPhase === "revealed" || questionPhase === "results";

    // Build rope data
    const ropes = question.options.map((option, index) => ({
      optionText: option.text,
      optionIndex: index,
      players: [] as PlayerOnRope[],
      isCorrect:
        question.correctOptionIndex !== undefined
          ? index === question.correctOptionIndex
          : null,
    }));

    const notAnswered: { playerId: string; playerName: string; elevation: number; lastOptionIndex: number | null }[] = [];

    // lastOptionIndex is now cached on the player record - no need to query all answers
    // (Updated in answers.submit mutation)

    // Group players by their answer
    for (const player of players) {
      const answer = answerMap.get(player._id);
      if (answer) {
        const ropePlayer: PlayerOnRope = {
          playerId: player._id,
          playerName: player.name,
          elevationAtAnswer: answer.elevationAtAnswer,
          answeredAt: answer.answeredAt,
          elevationGain: answer.elevationGain, // Populated after reveal
        };
        if (answer.optionIndex >= 0 && answer.optionIndex < ropes.length) {
          ropes[answer.optionIndex]!.players.push(ropePlayer);
        }
      } else {
        // Player hasn't answered current question - use cached lastOptionIndex from player record
        notAnswered.push({
          playerId: player._id,
          playerName: player.name,
          elevation: player.elevation ?? 0,
          lastOptionIndex: player.lastOptionIndex ?? null,
        });
      }
    }

    // Sort each rope by answeredAt (earlier answers = higher on rope)
    for (const rope of ropes) {
      rope.players.sort((a, b) => a.answeredAt - b.answeredAt);
    }

    return {
      question: {
        id: question._id,
        text: question.text,
        timeLimit: question.timeLimit,
      },
      questionPhase,
      ropes,
      notAnswered,
      timing: {
        firstAnsweredAt,
        timeLimit: question.timeLimit,
        isExpired,
        isRevealed,
      },
      totalPlayers,
      activePlayerCount,
      answeredCount,
    };
  },
});

/**
 * Lightweight player-specific rope state for the PlayerView.
 * Returns only what a single player needs during rope climbing:
 * - Question info (id, text, options, timeLimit)
 * - Player counts per rope (not full player lists)
 * - Current player's answer status and result
 * - Phase and timing info
 */
export const getPlayerRopeState = query({
  args: {
    sessionId: v.id("sessions"),
    playerId: v.id("players"),
  },
  handler: async (ctx, { sessionId, playerId }) => {
    const session = await ctx.db.get(sessionId);
    if (!session) return null;
    if (session.currentQuestionIndex < 0) return null;

    // Get the current question
    const enabledQuestions = await getEnabledQuestions(ctx, sessionId);

    const question = enabledQuestions[session.currentQuestionIndex];
    if (!question) return null;

    // Get all answers for this question
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", question._id))
      .collect();

    // Get the question phase from the session
    const questionPhase = (session.questionPhase ?? "answers_shown") as QuestionPhase;
    const isRevealed = questionPhase === "revealed" || questionPhase === "results";

    // Calculate timing
    const firstAnsweredAt =
      questionPhase !== "question_shown" && answers.length > 0
        ? Math.min(...answers.map((a) => a.answeredAt))
        : null;

    const now = Date.now();
    const isExpired =
      firstAnsweredAt !== null &&
      now - firstAnsweredAt >= question.timeLimit * 1000;

    // Count players per rope (answer option)
    const ropeCounts: number[] = question.options.map(() => 0);
    for (const answer of answers) {
      if (answer.optionIndex >= 0 && answer.optionIndex < ropeCounts.length) {
        ropeCounts[answer.optionIndex]!++;
      }
    }

    // Find the current player's answer
    const myAnswerDoc = answers.find((a) => a.playerId === playerId);
    const hasAnswered = !!myAnswerDoc;

    // Calculate player's position in answer order (if they answered)
    let position: number | null = null;
    if (myAnswerDoc) {
      const sortedAnswers = [...answers].sort((a, b) => a.answeredAt - b.answeredAt);
      position = sortedAnswers.findIndex((a) => a.playerId === playerId) + 1;
    }

    // Determine if player's answer was correct (only after reveal)
    let myIsCorrect: boolean | null = null;
    if (isRevealed && hasAnswered && question.correctOptionIndex !== undefined) {
      myIsCorrect = myAnswerDoc.optionIndex === question.correctOptionIndex;
    }

    // Get total player count
    const playerCount = await ctx.db
      .query("players")
      .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
      .collect();

    // Build rope data with counts
    const ropes = question.options.map((option, index) => ({
      optionIndex: index,
      optionText: option.text,
      playerCount: ropeCounts[index] ?? 0,
      isCorrect:
        question.correctOptionIndex !== undefined
          ? index === question.correctOptionIndex
          : null,
    }));

    return {
      question: {
        id: question._id,
        text: question.text,
        options: question.options,
        timeLimit: question.timeLimit,
      },
      ropes,
      myAnswer: {
        hasAnswered,
        optionIndex: myAnswerDoc?.optionIndex ?? null,
        isCorrect: myIsCorrect,
        position,
        elevationGain: myAnswerDoc?.elevationGain ?? null,
      },
      phase: questionPhase,
      timing: {
        firstAnsweredAt,
        timeLimit: question.timeLimit,
        isExpired,
        isRevealed,
      },
      answeredCount: answers.length,
      totalPlayers: playerCount.length,
    };
  },
});
