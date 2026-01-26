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

export default http;
