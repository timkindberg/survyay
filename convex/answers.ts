import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { calculateElevationGain, SUMMIT } from "../lib/elevation";

export const submit = mutation({
  args: {
    questionId: v.id("questions"),
    playerId: v.id("players"),
    optionIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const player = await ctx.db.get(args.playerId);
    if (!player) throw new Error("Player not found");

    // Get session for question start time
    const session = await ctx.db.get(question.sessionId);
    if (!session) throw new Error("Session not found");

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
    const answerTime = session.questionStartedAt
      ? answeredAt - session.questionStartedAt
      : 10000; // Default to 10s if no start time

    await ctx.db.insert("answers", {
      questionId: args.questionId,
      playerId: args.playerId,
      optionIndex: args.optionIndex,
      answeredAt,
    });

    // Calculate elevation if there's a correct answer
    if (question.correctOptionIndex !== undefined) {
      if (args.optionIndex === question.correctOptionIndex) {
        const elevationGain = calculateElevationGain(answerTime);
        const newElevation = Math.min(SUMMIT, player.elevation + elevationGain);

        await ctx.db.patch(args.playerId, {
          elevation: newElevation,
        });

        return {
          correct: true,
          elevationGain,
          newElevation,
          reachedSummit: newElevation >= SUMMIT,
        };
      }
      // Wrong answer - no elevation gain, stay at current level
      return {
        correct: false,
        elevationGain: 0,
        newElevation: player.elevation,
        reachedSummit: false,
      };
    }

    // For poll mode (no correct answer), small elevation for participation
    const newElevation = Math.min(SUMMIT, player.elevation + 10);
    await ctx.db.patch(args.playerId, {
      elevation: newElevation,
    });
    return {
      correct: null,
      elevationGain: 10,
      newElevation,
      reachedSummit: newElevation >= SUMMIT,
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
