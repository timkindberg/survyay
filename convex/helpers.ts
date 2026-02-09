import type { GenericQueryCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";
import type { Id } from "./_generated/dataModel";

/**
 * Fetch all enabled questions for a session, sorted by order.
 *
 * This pattern was duplicated across questions.ts, sessions.ts, and answers.ts.
 * "Enabled" means `enabled` field is not explicitly `false` (undefined = enabled).
 */
export async function getEnabledQuestions(
  ctx: GenericQueryCtx<DataModel>,
  sessionId: Id<"sessions">
) {
  const questions = await ctx.db
    .query("questions")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();

  return questions
    .filter((q) => q.enabled !== false)
    .sort((a, b) => a.order - b.order);
}
