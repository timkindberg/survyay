import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    text: v.string(),
    options: v.array(v.object({ text: v.string() })),
    correctOptionIndex: v.optional(v.number()),
    timeLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "lobby") throw new Error("Cannot add questions after game starts");

    // Get current question count for ordering
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const questionId = await ctx.db.insert("questions", {
      sessionId: args.sessionId,
      text: args.text,
      options: args.options,
      correctOptionIndex: args.correctOptionIndex,
      order: questions.length,
      timeLimit: args.timeLimit ?? 30, // Default 30 seconds
    });

    return questionId;
  },
});

export const listBySession = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return questions.sort((a, b) => a.order - b.order);
  },
});

export const get = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.questionId);
  },
});

export const getCurrentQuestion = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;
    if (session.currentQuestionIndex < 0) return null;

    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Filter to only enabled questions (undefined or true means enabled)
    const sorted = questions
      .filter((q) => q.enabled !== false)
      .sort((a, b) => a.order - b.order);
    return sorted[session.currentQuestionIndex] ?? null;
  },
});

export const remove = mutation({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const session = await ctx.db.get(question.sessionId);
    if (session && session.status !== "lobby") {
      throw new Error("Cannot delete questions after game starts");
    }

    await ctx.db.delete(args.questionId);
  },
});

export const update = mutation({
  args: {
    questionId: v.id("questions"),
    text: v.optional(v.string()),
    options: v.optional(v.array(v.object({ text: v.string() }))),
    correctOptionIndex: v.optional(v.number()),
    timeLimit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const session = await ctx.db.get(question.sessionId);
    if (session && session.status !== "lobby") {
      throw new Error("Cannot edit questions after game starts");
    }

    const updates: Partial<typeof question> = {};
    if (args.text !== undefined) updates.text = args.text;
    if (args.options !== undefined) updates.options = args.options;
    if (args.correctOptionIndex !== undefined) updates.correctOptionIndex = args.correctOptionIndex;
    if (args.timeLimit !== undefined) updates.timeLimit = args.timeLimit;

    await ctx.db.patch(args.questionId, updates);
  },
});

// Check if a question has been answered (is "completed")
export const hasAnswers = query({
  args: { questionId: v.id("questions") },
  handler: async (ctx, args) => {
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .first();
    return answers !== null;
  },
});

// Reorder questions by swapping positions
export const reorder = mutation({
  args: {
    questionId: v.id("questions"),
    direction: v.union(v.literal("up"), v.literal("down")),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    const session = await ctx.db.get(question.sessionId);
    if (!session) throw new Error("Session not found");

    // Check if question has answers (is completed)
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .first();
    if (answers) {
      throw new Error("Cannot reorder questions that have already been answered");
    }

    // Get all questions in the session sorted by order
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", question.sessionId))
      .collect();
    const sorted = questions.sort((a, b) => a.order - b.order);

    // Find current question index
    const currentIndex = sorted.findIndex((q) => q._id === args.questionId);
    if (currentIndex === -1) throw new Error("Question not found in session");

    // Calculate target index
    const targetIndex = args.direction === "up" ? currentIndex - 1 : currentIndex + 1;

    // Check bounds
    if (targetIndex < 0 || targetIndex >= sorted.length) {
      throw new Error("Cannot move question further in that direction");
    }

    const targetQuestion = sorted[targetIndex];
    if (!targetQuestion) throw new Error("Target question not found");

    // Check if target question has answers (is completed)
    const targetAnswers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", targetQuestion._id))
      .first();
    if (targetAnswers) {
      throw new Error("Cannot reorder past questions that have already been answered");
    }

    // Swap the order values
    const currentOrder = question.order;
    const targetOrder = targetQuestion.order;

    await ctx.db.patch(args.questionId, { order: targetOrder });
    await ctx.db.patch(targetQuestion._id, { order: currentOrder });
  },
});

// Toggle enabled state for a question
export const setEnabled = mutation({
  args: {
    questionId: v.id("questions"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) throw new Error("Question not found");

    // Check if question has answers (is completed)
    const answers = await ctx.db
      .query("answers")
      .withIndex("by_question", (q) => q.eq("questionId", args.questionId))
      .first();
    if (answers) {
      throw new Error("Cannot toggle questions that have already been answered");
    }

    await ctx.db.patch(args.questionId, { enabled: args.enabled });
  },
});
