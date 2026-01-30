import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const http = httpRouter();

// HTTP endpoint for player disconnect - called via sendBeacon on page unload
// This allows immediate disconnect detection when a player closes their tab
http.route({
  path: "/api/player-disconnect",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { playerId } = body as { playerId: Id<"players"> };

      if (!playerId) {
        return new Response("Missing playerId", { status: 400 });
      }

      // Mark player as disconnected by setting lastSeenAt to 0
      await ctx.runMutation(api.players.disconnect, { playerId });

      return new Response(null, { status: 200 });
    } catch (error) {
      // Log error but return 200 to avoid retries from sendBeacon
      console.error("Error in player-disconnect:", error);
      return new Response(null, { status: 200 });
    }
  }),
});

// HTTP endpoint for AI to bulk add questions to a session
// This allows external AI services to programmatically inject questions
http.route({
  path: "/api/add-questions",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    try {
      const body = await request.json();
      const { sessionCode, hostId, questions } = body as {
        sessionCode: string;
        hostId: string;
        questions: Array<{
          text: string;
          options: string[];
          correctIndex: number;
          timeLimit?: number;
        }>;
      };

      // Validate input
      if (!sessionCode || !hostId || !questions || !Array.isArray(questions)) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: sessionCode, hostId, questions" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      if (questions.length === 0) {
        return new Response(
          JSON.stringify({ error: "Questions array cannot be empty" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Validate each question
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q || typeof q !== "object") {
          return new Response(
            JSON.stringify({ error: `Question ${i + 1} is invalid` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!q.text || typeof q.text !== "string") {
          return new Response(
            JSON.stringify({ error: `Question ${i + 1}: text is required and must be a string` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return new Response(
            JSON.stringify({ error: `Question ${i + 1}: options must be an array with at least 2 items` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
        if (typeof q.correctIndex !== "number" || q.correctIndex < 0 || q.correctIndex >= q.options.length) {
          return new Response(
            JSON.stringify({ error: `Question ${i + 1}: correctIndex must be a valid option index (0-${q.options.length - 1})` }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }

      // Find session by code
      const session = await ctx.runQuery(api.sessions.getByCode, { code: sessionCode.toUpperCase() });
      if (!session) {
        return new Response(
          JSON.stringify({ error: `Session with code "${sessionCode}" not found` }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      // Verify hostId matches
      if (session.hostId !== hostId) {
        return new Response(
          JSON.stringify({ error: "Invalid hostId for this session" }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        );
      }

      // Check session is in lobby state
      if (session.status !== "lobby") {
        return new Response(
          JSON.stringify({ error: "Can only add questions to sessions in lobby state" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Delete all existing questions first (replace, not add)
      const existingQuestions = await ctx.runQuery(api.questions.listBySession, {
        sessionId: session._id,
      });
      for (const q of existingQuestions) {
        await ctx.runMutation(api.questions.remove, { questionId: q._id });
      }

      // Insert new questions
      const questionIds: Id<"questions">[] = [];
      for (const q of questions) {
        const questionId = await ctx.runMutation(api.questions.create, {
          sessionId: session._id,
          text: q.text,
          options: q.options.map((text) => ({ text })),
          correctOptionIndex: q.correctIndex,
          timeLimit: q.timeLimit || 30,
        });
        questionIds.push(questionId);
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `Successfully added ${questionIds.length} questions`,
          questionIds,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    } catch (error) {
      console.error("Error in add-questions:", error);
      return new Response(
        JSON.stringify({
          error: "Internal server error",
          details: error instanceof Error ? error.message : String(error),
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  }),
});

export default http;
