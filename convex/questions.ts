import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    sessionId: v.id("sessions"),
    text: v.string(),
    options: v.array(v.object({ text: v.string() })),
    correctOptionIndex: v.optional(v.number()),
    timeLimit: v.optional(v.number()),
    followUpText: v.optional(v.string()),
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
      followUpText: args.followUpText,
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
    followUpText: v.optional(v.string()),
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
    if (args.followUpText !== undefined) updates.followUpText = args.followUpText;

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

// Export questions in JSON format (same as AI injection API)
export const exportQuestions = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const sorted = questions.sort((a, b) => a.order - b.order);

    return {
      questions: sorted.map((q) => ({
        text: q.text,
        options: q.options.map((o) => o.text),
        correctIndex: q.correctOptionIndex ?? 0,
        timeLimit: q.timeLimit,
        followUpText: q.followUpText,
      })),
    };
  },
});

// Import questions from JSON (replaces existing questions)
export const importQuestions = mutation({
  args: {
    sessionId: v.id("sessions"),
    questions: v.array(
      v.object({
        text: v.string(),
        options: v.array(v.string()),
        correctIndex: v.number(),
        timeLimit: v.optional(v.number()),
        followUpText: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "lobby") throw new Error("Can only import questions in lobby state");

    // Validate questions
    if (args.questions.length === 0) {
      throw new Error("Questions array cannot be empty");
    }

    for (let i = 0; i < args.questions.length; i++) {
      const q = args.questions[i];
      if (!q) throw new Error(`Question ${i + 1} is invalid`);
      if (!q.text || typeof q.text !== "string") {
        throw new Error(`Question ${i + 1}: text is required and must be a string`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2) {
        throw new Error(`Question ${i + 1}: options must be an array with at least 2 items`);
      }
      if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
        throw new Error(`Question ${i + 1}: correctIndex must be a valid option index (0-${q.options.length - 1})`);
      }
    }

    // Delete all existing questions first
    const existingQuestions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    for (const q of existingQuestions) {
      await ctx.db.delete(q._id);
    }

    // Insert new questions
    for (const q of args.questions) {
      await ctx.db.insert("questions", {
        sessionId: args.sessionId,
        text: q.text,
        options: q.options.map((text) => ({ text })),
        correctOptionIndex: q.correctIndex,
        order: args.questions.indexOf(q),
        timeLimit: q.timeLimit ?? 30,
        followUpText: q.followUpText,
      });
    }

    return { success: true, count: args.questions.length };
  },
});

// Shuffle questions in random order
export const shuffleQuestions = mutation({
  args: {
    sessionId: v.id("sessions"),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");
    if (session.status !== "lobby") throw new Error("Can only shuffle questions in lobby state");

    // Get all questions
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    if (questions.length < 2) {
      // Nothing to shuffle
      return { success: true };
    }

    // Fisher-Yates shuffle algorithm to generate random order indices
    const indices = questions.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j]!, indices[i]!];
    }

    // Update each question with new order value
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      if (question) {
        await ctx.db.patch(question._id, { order: indices[i] });
      }
    }

    return { success: true };
  },
});
