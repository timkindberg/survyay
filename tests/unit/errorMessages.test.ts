import { describe, test, expect } from "vitest";
import { getFriendlyErrorMessage, createErrorState } from "../../src/lib/errorMessages";

describe("errorMessages", () => {
  describe("getFriendlyErrorMessage", () => {
    test("should return friendly message for known errors", () => {
      expect(getFriendlyErrorMessage(new Error("Name already taken in this session")))
        .toBe("That name is already in use. Try another!");

      expect(getFriendlyErrorMessage(new Error("Session not found")))
        .toBe("Game not found. Check the code and try again.");

      expect(getFriendlyErrorMessage(new Error("Game has ended")))
        .toBe("This game has already ended.");
    });

    test("should handle answer submission errors", () => {
      expect(getFriendlyErrorMessage(new Error("Already answered this question")))
        .toBe("You've already submitted your answer!");

      expect(getFriendlyErrorMessage(new Error("Time's up! Answer not accepted.")))
        .toBe("Time's up! Your answer wasn't submitted in time.");

      expect(getFriendlyErrorMessage(new Error("Answers are not being accepted right now")))
        .toBe("Wait for the host to show the answers first!");
    });

    test("should handle session management errors", () => {
      expect(getFriendlyErrorMessage(new Error("Add at least one enabled question before starting")))
        .toBe("Add at least one question before starting the game.");

      expect(getFriendlyErrorMessage(new Error("Session already started")))
        .toBe("This game has already started.");
    });

    test("should extract message from Convex error format", () => {
      expect(getFriendlyErrorMessage(new Error("Uncaught Error: Name already taken in this session")))
        .toBe("That name is already in use. Try another!");

      expect(getFriendlyErrorMessage(new Error("Error: Session not found")))
        .toBe("Game not found. Check the code and try again.");
    });

    test("should handle partial matches", () => {
      expect(getFriendlyErrorMessage(new Error("Some prefix: Name already taken in this session")))
        .toBe("That name is already in use. Try another!");
    });

    test("should return generic message for technical errors", () => {
      expect(getFriendlyErrorMessage(new Error("Cannot read _id of undefined")))
        .toBe("Something went wrong. Please try again.");

      expect(getFriendlyErrorMessage(new Error("convex:internal error")))
        .toBe("Something went wrong. Please try again.");
    });

    test("should pass through unknown but readable errors", () => {
      expect(getFriendlyErrorMessage(new Error("Custom error message")))
        .toBe("Custom error message");
    });

    test("should handle string errors", () => {
      expect(getFriendlyErrorMessage("Name already taken in this session"))
        .toBe("That name is already in use. Try another!");
    });

    test("should handle null/undefined/unknown types", () => {
      expect(getFriendlyErrorMessage(null))
        .toBe("An unexpected error occurred");

      expect(getFriendlyErrorMessage(undefined))
        .toBe("An unexpected error occurred");

      expect(getFriendlyErrorMessage({ weird: "object" }))
        .toBe("An unexpected error occurred");
    });
  });

  describe("createErrorState", () => {
    test("should create error state with message and timestamp", () => {
      const before = Date.now();
      const state = createErrorState(new Error("Session not found"));
      const after = Date.now();

      expect(state.message).toBe("Game not found. Check the code and try again.");
      expect(state.timestamp).toBeGreaterThanOrEqual(before);
      expect(state.timestamp).toBeLessThanOrEqual(after);
    });
  });
});
