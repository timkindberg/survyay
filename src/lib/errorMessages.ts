/**
 * Maps Convex error messages to user-friendly display text.
 * This provides a central place to manage all error message translations.
 */

// Map of raw error messages to friendly messages
const ERROR_MESSAGE_MAP: Record<string, string> = {
  // Player join errors
  "Name already taken in this session": "That name is already in use. Try another!",
  "Session not found": "Game not found. Check the code and try again.",
  "Game has ended": "This game has already ended.",

  // Answer submission errors
  "Question not found": "This question is no longer available.",
  "Player not found": "Your session has expired. Please rejoin the game.",
  "Answers are not being accepted right now": "Wait for the host to show the answers first!",
  "Already answered this question": "You've already submitted your answer!",
  "Time's up! Answer not accepted.": "Time's up! Your answer wasn't submitted in time.",

  // Session management errors (admin)
  "Session already started": "This game has already started.",
  "Session not active": "The game is not currently active.",
  "Add at least one enabled question before starting": "Add at least one question before starting the game.",
  "Can only show answers from question_shown phase": "Wait for the question to be shown first.",
  "Can only reveal from answers_shown phase": "Wait for answers to be submitted first.",
  "Can only show results from revealed phase": "Reveal the answer first before showing results.",
  "Can only go back to lobby from active state": "You can only reset from an active game.",
  "Cannot go back from current state": "Cannot go back any further.",
};

/**
 * Extracts the actual error message from a Convex error.
 * Convex errors often come wrapped in extra context text.
 */
function extractConvexErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // Convex errors often include "Uncaught Error: " prefix
    // or are wrapped like "Error: Some message"
    const patterns = [
      /Uncaught Error:\s*(.+)/,
      /Error:\s*(.+)/,
      /ConvexError:\s*(.+)/,
    ];

    for (const pattern of patterns) {
      const match = message.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "An unexpected error occurred";
}

/**
 * Converts a Convex error to a user-friendly message.
 * Falls back to a generic message if no mapping exists.
 */
export function getFriendlyErrorMessage(error: unknown): string {
  const rawMessage = extractConvexErrorMessage(error);

  // Check for exact match first
  if (ERROR_MESSAGE_MAP[rawMessage]) {
    return ERROR_MESSAGE_MAP[rawMessage];
  }

  // Check for partial matches (for errors that might have extra context)
  for (const [key, friendly] of Object.entries(ERROR_MESSAGE_MAP)) {
    if (rawMessage.includes(key)) {
      return friendly;
    }
  }

  // If it's a technical-looking error, return a generic message
  if (rawMessage.includes("_id") || rawMessage.includes("convex") || rawMessage.includes("undefined")) {
    return "Something went wrong. Please try again.";
  }

  // Otherwise, return the original message (it might already be readable)
  return rawMessage;
}

/**
 * Type for error state that includes auto-dismiss functionality
 */
export interface ErrorState {
  message: string;
  timestamp: number;
}

/**
 * Creates an error state object with a timestamp for auto-dismiss
 */
export function createErrorState(error: unknown): ErrorState {
  return {
    message: getFriendlyErrorMessage(error),
    timestamp: Date.now(),
  };
}
