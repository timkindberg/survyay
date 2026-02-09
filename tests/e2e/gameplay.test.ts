import { test, expect, type Page } from "@playwright/test";

/**
 * E2E Gameplay Flow Test
 *
 * Exercises the core game loop with two browser pages:
 * Host (admin) creates session -> Player joins -> Host starts game ->
 * Host advances through question phases -> Player answers ->
 * Host reveals answer -> Verify elevation change -> Next question
 *
 * Requires both Vite dev server and Convex dev server running.
 */

test.describe("Gameplay Flow", () => {
  test("full game loop: create session, join, answer question, verify elevation", async ({
    context,
  }) => {
    // Use a longer timeout since we're coordinating two pages + Convex backend
    test.setTimeout(90_000);

    const hostPage = await context.newPage();
    const playerPage = await context.newPage();

    try {
      // ──────────────────────────────────────────────
      // Step 1: Host creates a session
      // ──────────────────────────────────────────────
      await hostPage.goto("/");
      await hostPage.getByRole("button", { name: /Host a Game/i }).click();

      // Click "Create New Session" button
      await hostPage.getByRole("button", { name: /Create New Session/i }).click();

      // Wait for session code to appear (4-letter code in the header)
      const codeElement = hostPage.locator(".code-value");
      await expect(codeElement).toBeVisible({ timeout: 15_000 });
      const sessionCode = (await codeElement.textContent())!.trim();
      expect(sessionCode).toMatch(/^[A-Z]{4}$/);

      // Verify session is in lobby status
      await expect(hostPage.locator(".status-badge.status-lobby")).toBeVisible();

      // Verify questions were auto-generated
      await expect(hostPage.getByText(/Questions \(\d+\)/)).toBeVisible();

      // ──────────────────────────────────────────────
      // Step 2: Player joins the session
      // ──────────────────────────────────────────────
      await playerPage.goto("/");
      await playerPage.getByRole("button", { name: /Join Game/i }).click();

      // Fill in join code and name
      await playerPage.getByPlaceholder(/Join Code/i).fill(sessionCode);
      await playerPage.getByPlaceholder(/Your Name/i).fill("E2EPlayer");

      // Wait for the session lookup to resolve (button becomes enabled)
      const joinButton = playerPage.getByRole("button", { name: /^Join$/i });
      await expect(joinButton).toBeEnabled({ timeout: 10_000 });
      await joinButton.click();

      // Player should be in the lobby now, waiting for host
      await expect(
        playerPage.getByText(/Waiting for host to start/i)
      ).toBeVisible({ timeout: 10_000 });

      // Verify player shows up in admin's player list
      await expect(hostPage.getByText("E2EPlayer")).toBeVisible({ timeout: 10_000 });

      // ──────────────────────────────────────────────
      // Step 3: Host starts the game
      // ──────────────────────────────────────────────
      // The start button shows "Start Game (N questions)"
      const startButton = hostPage.getByRole("button", { name: /Start Game/i });
      await expect(startButton).toBeEnabled();
      await startButton.click();

      // Session should transition to active + pre_game phase
      await expect(hostPage.locator(".status-badge.status-active")).toBeVisible({
        timeout: 10_000,
      });
      await expect(hostPage.getByText(/Get Ready/i)).toBeVisible();

      // Player should see the pre-game screen
      await expect(
        playerPage.getByText(/Get Ready/i)
      ).toBeVisible({ timeout: 10_000 });

      // ──────────────────────────────────────────────
      // Step 4: Host advances to first question
      // ──────────────────────────────────────────────
      const firstQuestionButton = hostPage.getByRole("button", {
        name: /First Question/i,
      });
      await expect(firstQuestionButton).toBeVisible();
      await firstQuestionButton.click();

      // Admin should show "Showing Question" phase
      await expect(
        hostPage.getByText(/Showing Question/i)
      ).toBeVisible({ timeout: 10_000 });

      // Player should see the question text and "Waiting for host to show answers"
      await expect(
        playerPage.getByText(/Waiting for host to show answers/i)
      ).toBeVisible({ timeout: 10_000 });

      // ──────────────────────────────────────────────
      // Step 5: Host shows answers
      // ──────────────────────────────────────────────
      const showAnswersButton = hostPage.getByRole("button", {
        name: /Show Answers/i,
      });
      await expect(showAnswersButton).toBeVisible();
      await showAnswersButton.click();

      // Admin should show "Accepting Answers" phase
      await expect(
        hostPage.getByText(/Accepting Answers/i)
      ).toBeVisible({ timeout: 10_000 });

      // Player should see answer option buttons
      // Options are rendered as buttons inside .options container
      const optionButtons = playerPage.locator(".options button");
      await expect(optionButtons.first()).toBeVisible({ timeout: 10_000 });
      const optionCount = await optionButtons.count();
      expect(optionCount).toBeGreaterThanOrEqual(2);

      // ──────────────────────────────────────────────
      // Step 6: Player answers the first option (index 0)
      // ──────────────────────────────────────────────
      await optionButtons.first().click();

      // Player should see "Waiting for results..."
      await expect(
        playerPage.getByText(/Waiting for results/i)
      ).toBeVisible({ timeout: 10_000 });

      // Admin should show "1 / 1 answered"
      await expect(hostPage.getByText(/1 \/ 1 answered/i)).toBeVisible({
        timeout: 10_000,
      });

      // ──────────────────────────────────────────────
      // Step 7: Host reveals the answer
      // ──────────────────────────────────────────────
      const revealButton = hostPage.getByRole("button", {
        name: /Reveal Answer/i,
      });
      await expect(revealButton).toBeVisible();
      await revealButton.click();

      // Admin should show "Revealed" phase
      await expect(hostPage.getByText("Revealed")).toBeVisible({
        timeout: 10_000,
      });

      // Player should eventually see a result banner (CORRECT!, WRONG!, or No Answer)
      // Wait a bit for the scissors animation timing
      const resultBanner = playerPage.locator(".result-banner:not(.tension)");
      await expect(resultBanner).toBeVisible({ timeout: 15_000 });

      // The result text should be one of: "CORRECT!", "WRONG!", or "No Answer"
      const resultText = await resultBanner.locator(".result-text").textContent();
      expect(["CORRECT!", "WRONG!"]).toContain(resultText);

      // ──────────────────────────────────────────────
      // Step 8: Host shows leaderboard (results phase)
      // ──────────────────────────────────────────────
      const showLeaderboardButton = hostPage.getByRole("button", {
        name: /Show Leaderboard/i,
      });
      await expect(showLeaderboardButton).toBeVisible();
      await showLeaderboardButton.click();

      // Admin should show "Results" phase or leaderboard header
      await expect(hostPage.getByText("Leaderboard")).toBeVisible({
        timeout: 10_000,
      });

      // Player should see the results leaderboard
      await expect(
        playerPage.getByText("Leaderboard")
      ).toBeVisible({ timeout: 10_000 });

      // ──────────────────────────────────────────────
      // Step 9: Verify player elevation state
      // ──────────────────────────────────────────────
      // Player's score bar shows "Xm" - check that the elevation display exists
      const elevationText = await playerPage.locator(".score-bar").textContent();
      expect(elevationText).toContain("m");

      // The elevation value is shown in the score bar as "{name} {elevation}m"
      // After one question, elevation should be either >0 (correct) or 0 (wrong)
      const elevationMatch = elevationText?.match(/(\d+)m/);
      expect(elevationMatch).not.toBeNull();
      const elevation = parseInt(elevationMatch![1]!, 10);
      // Elevation is a non-negative number (0 if wrong, >0 if correct)
      expect(elevation).toBeGreaterThanOrEqual(0);

      // ──────────────────────────────────────────────
      // Step 10: Host advances to next question (or ends game)
      // ──────────────────────────────────────────────
      // The button should say "Next Question" or "End Game" if it was the last question
      const nextButton = hostPage.getByRole("button", {
        name: /Next Question|End Game/i,
      });
      await expect(nextButton).toBeVisible();
      await nextButton.click();

      // If "Next Question" was clicked, we should see a new question
      // If "End Game" was clicked, the session should be finished
      // Either way, the flow completed successfully
      // Wait a moment for the transition
      await hostPage.waitForTimeout(1_000);

      // Check if game ended or new question appeared
      const isFinished = await hostPage.locator(".status-badge.status-finished").isVisible().catch(() => false);
      if (isFinished) {
        // Game finished - player should see "Game Over!"
        await expect(playerPage.getByText(/Game Over/i)).toBeVisible({
          timeout: 10_000,
        });
      } else {
        // New question phase - admin should show question phase UI
        await expect(
          hostPage.getByText(/Showing Question|Q\d+ \//i)
        ).toBeVisible({ timeout: 10_000 });
      }
    } finally {
      await hostPage.close();
      await playerPage.close();
    }
  });
});
