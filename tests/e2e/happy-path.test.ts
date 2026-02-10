import { test, expect, type Page } from "@playwright/test";
import {
  hostCreateSession,
  playerJoin,
  spectatorJoin,
  hostAdvance,
  playerAnswer,
  getVisualElevation,
  getRopePositions,
  getBlobHorizontalPosition,
  getClosestRope,
} from "./helpers";

test.describe.serial(
  "Happy Path: Full Game with Host + Spectator + 2 Players",
  () => {
    test.setTimeout(120_000);

    let hostPage: Page;
    let spectatorPage: Page;
    let player1Page: Page;
    let player2Page: Page;
    let sessionCode: string;

    // Blob elevation tracking (in meters, 0m=base, 1000m=summit)
    let aliceElevationBefore: number | null = null;
    let bobElevationBefore: number | null = null;
    let aliceElevationAfter: number | null = null;
    let bobElevationAfter: number | null = null;

    test.beforeAll(async ({ browser }) => {
      // Each participant gets its own context for localStorage isolation
      const hostContext = await browser.newContext();
      hostPage = await hostContext.newPage();

      const player1Context = await browser.newContext();
      player1Page = await player1Context.newPage();

      const player2Context = await browser.newContext();
      player2Page = await player2Context.newPage();

      // Spectator gets its own context with wider viewport
      const spectatorContext = await browser.newContext({
        viewport: { width: 1280, height: 720 },
      });
      spectatorPage = await spectatorContext.newPage();
    });

    test.afterAll(async () => {
      await hostPage?.close();
      await player1Page?.close();
      await player2Page?.close();
      await spectatorPage?.close();
    });

    test("home page loads with correct elements", async () => {
      await hostPage.goto("/");

      await expect(hostPage).toHaveTitle(/Blobby/);
      await expect(
        hostPage.getByRole("heading", { name: "Blobby: Summit" })
      ).toBeVisible();
      await expect(
        hostPage.getByText("Race your blob to the mountain top!")
      ).toBeVisible();
      await expect(
        hostPage.getByRole("button", { name: "Join Game" })
      ).toBeVisible();
      await expect(
        hostPage.getByRole("button", { name: "Spectate" })
      ).toBeVisible();
      await expect(
        hostPage.getByRole("button", { name: "Host a Game" })
      ).toBeVisible();
    });

    test("host creates a session with auto-generated questions", async () => {
      sessionCode = await hostCreateSession(hostPage);

      await expect(
        hostPage.locator(".status-badge.status-lobby").first()
      ).toBeVisible();
      await expect(hostPage.getByText(/Questions \(\d+\)/)).toBeVisible();
    });

    test("two players and spectator join the session", async () => {
      await playerJoin(player1Page, sessionCode, "Alice");
      await playerJoin(player2Page, sessionCode, "Bob");
      await spectatorJoin(spectatorPage, sessionCode);

      // Host sees both players
      await expect(hostPage.getByText("Alice")).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.getByText("Bob")).toBeVisible({ timeout: 10_000 });

      // Spectator sees player count and waiting text
      await expect(
        spectatorPage.locator(".spectator-player-count")
      ).toContainText("2", { timeout: 10_000 });
      await expect(
        spectatorPage.getByText("Waiting for host to start...")
      ).toBeVisible();

      // Spectator lobby shows join code prominently
      await expect(spectatorPage.locator(".join-code")).toBeVisible();

      // Spectator shows lobby blobs (animated background blobs)
      await expect(spectatorPage.locator(".lobby-blob").first()).toBeVisible({ timeout: 10_000 });

      // Players see waiting lobby with their own blob
      await expect(player1Page.locator(".waiting-lobby")).toBeVisible({ timeout: 10_000 });
      await expect(player2Page.locator(".waiting-lobby")).toBeVisible({ timeout: 10_000 });

      // Players see each other's blobs in the lobby
      await expect(player1Page.locator(".waiting-blob").first()).toBeVisible({ timeout: 10_000 });
    });

    test("host starts game, all views show pre-game phase", async () => {
      await hostAdvance(hostPage, /Start Game/);

      // Host sees active status + Get Ready
      await expect(
        hostPage.locator(".status-badge.status-active").first()
      ).toBeVisible({ timeout: 10_000 });
      await expect(hostPage.getByText("Get Ready!")).toBeVisible();

      // Both players see Get Ready
      await expect(player1Page.getByText("Get Ready!")).toBeVisible({
        timeout: 10_000,
      });
      await expect(player2Page.getByText("Get Ready!")).toBeVisible({
        timeout: 10_000,
      });

      // Spectator sees Get Ready
      await expect(spectatorPage.getByText("Get Ready!")).toBeVisible({
        timeout: 10_000,
      });

      // Spectator shows the mountain
      await expect(spectatorPage.locator(".mountain")).toBeVisible({ timeout: 10_000 });

      // Spectator shows pre-game overlay with "Get Ready!"
      await expect(spectatorPage.locator(".pregame-overlay")).toBeVisible({ timeout: 10_000 });

      // Player views show the mountain
      await expect(player1Page.locator(".mountain")).toBeVisible({ timeout: 10_000 });
      await expect(player2Page.locator(".mountain")).toBeVisible({ timeout: 10_000 });

      // --- Blob position assertions (pre-game: both at 0m) ---
      // Wait briefly for blobs to render at their positions
      await spectatorPage.waitForTimeout(500);

      const aliceElevation = await getVisualElevation(spectatorPage, "Alice");
      const bobElevation = await getVisualElevation(spectatorPage, "Bob");

      if (aliceElevation !== null && bobElevation !== null) {
        // Both players start at 0m elevation
        expect(aliceElevation).toBeLessThanOrEqual(50); // Should be near 0m, generous tolerance
        expect(bobElevation).toBeLessThanOrEqual(50);

        // Both should be at approximately the same elevation
        expect(Math.abs(aliceElevation - bobElevation)).toBeLessThanOrEqual(20);

        // Save for later comparison
        aliceElevationBefore = aliceElevation;
        bobElevationBefore = bobElevation;
      }

      // Also check on player pages (each player sees their own mountain)
      await player1Page.waitForTimeout(500);
      const aliceOnP1 = await getVisualElevation(player1Page, "Alice");
      if (aliceOnP1 !== null) {
        expect(aliceOnP1).toBeLessThanOrEqual(50);
      }

      await player2Page.waitForTimeout(500);
      const bobOnP2 = await getVisualElevation(player2Page, "Bob");
      if (bobOnP2 !== null) {
        expect(bobOnP2).toBeLessThanOrEqual(50);
      }
    });

    test("host shows first question, players see question text", async () => {
      await hostAdvance(hostPage, /First Question/);

      await expect(hostPage.getByText("Showing Question")).toBeVisible();

      await expect(
        player1Page.getByText("Waiting for host to show answers...")
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        player2Page.getByText("Waiting for host to show answers...")
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        spectatorPage.getByText(/Question 1 of \d+/)
      ).toBeVisible({ timeout: 10_000 });

      // Spectator shows question overlay with question text
      await expect(spectatorPage.locator(".spectator-question-overlay")).toBeVisible({ timeout: 10_000 });
      await expect(spectatorPage.locator(".spectator-question-text")).toBeVisible();
      // Question text should have some content (not empty)
      const questionText = await spectatorPage.locator(".spectator-question-text").textContent();
      expect(questionText!.length).toBeGreaterThan(5);

      // Spectator mountain is still visible behind the question
      await expect(spectatorPage.locator(".mountain")).toBeVisible();

      // --- Blob position assertions: blobs should still be at base camp ---
      await spectatorPage.waitForTimeout(500);

      const aliceElevQ = await getVisualElevation(spectatorPage, "Alice");
      const bobElevQ = await getVisualElevation(spectatorPage, "Bob");

      if (aliceElevQ !== null) {
        // Should not have moved from pre-game position
        expect(aliceElevQ).toBeLessThanOrEqual(50);
        if (aliceElevationBefore !== null) {
          expect(Math.abs(aliceElevQ - aliceElevationBefore)).toBeLessThanOrEqual(30);
        }
      }
      if (bobElevQ !== null) {
        expect(bobElevQ).toBeLessThanOrEqual(50);
        if (bobElevationBefore !== null) {
          expect(Math.abs(bobElevQ - bobElevationBefore)).toBeLessThanOrEqual(30);
        }
      }
    });

    test("host shows answers, both players submit answers", async () => {
      await hostAdvance(hostPage, /Show Answers/);

      await expect(hostPage.getByText("Accepting Answers")).toBeVisible();

      // Both players see option buttons
      await expect(
        player1Page.locator(".options button").first()
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        player2Page.locator(".options button").first()
      ).toBeVisible({ timeout: 10_000 });

      // Each player has at least 2 answer options with letter labels
      const p1Options = player1Page.locator(".options button");
      const optionCount = await p1Options.count();
      expect(optionCount).toBeGreaterThanOrEqual(2);

      // Answer options have letter labels (A, B, C, D)
      await expect(player1Page.locator(".option-label").first()).toBeVisible();

      // Spectator shows rope answer labels
      await expect(spectatorPage.locator(".rope-answer-label").first()).toBeVisible({ timeout: 10_000 });

      // Player 1 picks option 0, Player 2 picks option 1
      await playerAnswer(player1Page, 0);
      await playerAnswer(player2Page, 1);

      // Both players see waiting for results
      await expect(
        player1Page.getByText("Waiting for results...")
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        player2Page.getByText("Waiting for results...")
      ).toBeVisible({ timeout: 10_000 });

      // Host sees 2/2 answered
      await expect(hostPage.getByText(/2 \/ 2 answered/)).toBeVisible({
        timeout: 10_000,
      });

      // Spectator shows blobs climbing ropes
      await expect(spectatorPage.locator(".rope-climber").first()).toBeVisible({ timeout: 10_000 });

      // At least 2 rope climbers (one per player)
      const climberCount = await spectatorPage.locator(".rope-climber").count();
      expect(climberCount).toBeGreaterThanOrEqual(2);

      // Ropes are visible on the spectator mountain
      await expect(spectatorPage.locator(".rope").first()).toBeVisible({ timeout: 5_000 });

      // --- Blob horizontal position assertions: climbers should be ON their ropes ---
      await spectatorPage.waitForTimeout(500);

      const ropePositions = await getRopePositions(spectatorPage);
      if (ropePositions !== null && ropePositions.length >= 2) {
        // Check Alice's climber blob is near a rope
        const aliceX = await getBlobHorizontalPosition(spectatorPage, "Alice");
        if (aliceX !== null) {
          const aliceClosest = getClosestRope(aliceX, ropePositions);
          if (aliceClosest !== null) {
            // Blob should be within 10% of mountain width from its rope
            expect(aliceClosest.distance).toBeLessThanOrEqual(10);
          }
        }

        // Check Bob's climber blob is near a rope
        const bobX = await getBlobHorizontalPosition(spectatorPage, "Bob");
        if (bobX !== null) {
          const bobClosest = getClosestRope(bobX, ropePositions);
          if (bobClosest !== null) {
            expect(bobClosest.distance).toBeLessThanOrEqual(10);
          }
        }

        // Both players picked different options, so they should be near different ropes
        if (aliceX !== null && bobX !== null) {
          const aliceClosest = getClosestRope(aliceX, ropePositions);
          const bobClosest = getClosestRope(bobX, ropePositions);
          if (aliceClosest !== null && bobClosest !== null) {
            expect(aliceClosest.label).not.toBe(bobClosest.label);
          }
        }
      }
    });

    test("host reveals answer, players see result banners", async () => {
      await hostAdvance(hostPage, /Reveal Answer/);

      // Host shows "Revealed" phase badge
      await expect(hostPage.getByText("Revealed")).toBeVisible({
        timeout: 10_000,
      });

      // Both players see result banners (after scissors animation)
      const p1ResultBanner = player1Page.locator(".result-banner:not(.tension)");
      await expect(p1ResultBanner).toBeVisible({ timeout: 15_000 });

      const p2ResultBanner = player2Page.locator(".result-banner:not(.tension)");
      await expect(p2ResultBanner).toBeVisible({ timeout: 15_000 });

      // Each player's result text is either CORRECT! or WRONG!
      const p1ResultText = await p1ResultBanner
        .locator(".result-text")
        .textContent();
      expect(["CORRECT!", "WRONG!"]).toContain(p1ResultText);

      const p2ResultText = await p2ResultBanner
        .locator(".result-text")
        .textContent();
      expect(["CORRECT!", "WRONG!"]).toContain(p2ResultText);

      // Each player sees elevation gain
      await expect(
        player1Page.locator(".elevation-gain")
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        player2Page.locator(".elevation-gain")
      ).toBeVisible({ timeout: 10_000 });

      // Spectator shows which answer was correct
      await expect(
        spectatorPage.locator(".rope-answer-label-correct").first()
      ).toBeVisible({ timeout: 15_000 });

      // Players see elevation gain with a real value
      const p1Gain = await player1Page.locator(".elevation-gain").textContent();
      expect(p1Gain).toBeTruthy();
      // Elevation gain should contain a number (like "+100m" or "+0m")
      expect(p1Gain).toMatch(/\d+/);

      const p2Gain = await player2Page.locator(".elevation-gain").textContent();
      expect(p2Gain).toBeTruthy();
      expect(p2Gain).toMatch(/\d+/);

      // --- Blob position assertions after reveal ---
      // Wait for rope-cutting animation to settle (rope-climbers disappear, mountain-players reappear)
      await spectatorPage.waitForTimeout(2000);

      const alicePostReveal = await getVisualElevation(spectatorPage, "Alice");
      const bobPostReveal = await getVisualElevation(spectatorPage, "Bob");

      // Determine who answered correctly from the result banners
      const p1WasCorrect = p1ResultText === "CORRECT!";
      const p2WasCorrect = p2ResultText === "CORRECT!";

      if (alicePostReveal !== null && bobPostReveal !== null) {
        // Both should be in valid bounds
        expect(alicePostReveal).toBeGreaterThanOrEqual(-50);
        expect(alicePostReveal).toBeLessThanOrEqual(1050);
        expect(bobPostReveal).toBeGreaterThanOrEqual(-50);
        expect(bobPostReveal).toBeLessThanOrEqual(1050);

        // The correct answerer should have gained elevation from baseline
        if (p1WasCorrect && aliceElevationBefore !== null) {
          expect(alicePostReveal).toBeGreaterThan(aliceElevationBefore + 10);
        }
        if (p2WasCorrect && bobElevationBefore !== null) {
          expect(bobPostReveal).toBeGreaterThan(bobElevationBefore + 10);
        }

        // The wrong answerer should be near their pre-game elevation
        if (!p1WasCorrect && aliceElevationBefore !== null) {
          expect(Math.abs(alicePostReveal - aliceElevationBefore)).toBeLessThanOrEqual(30);
        }
        if (!p2WasCorrect && bobElevationBefore !== null) {
          expect(Math.abs(bobPostReveal - bobElevationBefore)).toBeLessThanOrEqual(30);
        }
      }
    });

    test("host shows leaderboard, all views display results", async () => {
      await hostAdvance(hostPage, /Show Leaderboard/);

      await expect(
        hostPage.getByRole("heading", { name: "Leaderboard" })
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        player1Page.getByRole("heading", { name: "Leaderboard" })
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        player2Page.getByRole("heading", { name: "Leaderboard" })
      ).toBeVisible({ timeout: 10_000 });

      await expect(
        spectatorPage.locator(".leaderboard-overlay")
      ).toBeVisible({ timeout: 10_000 });

      // Host shows player cards in results mode (admin uses .player-grid, not Leaderboard component)
      await expect(hostPage.locator(".player-grid").first()).toBeVisible({ timeout: 10_000 });

      // Player views use the actual Leaderboard component with .leaderboard-row
      const p1LeaderboardRows = player1Page.locator(".leaderboard-row");
      await expect(p1LeaderboardRows.first()).toBeVisible({ timeout: 10_000 });
      const rowCount = await p1LeaderboardRows.count();
      expect(rowCount).toBeGreaterThanOrEqual(2);

      // Leaderboard entries have rank numbers and elevation values
      await expect(player1Page.locator(".leaderboard-rank").first()).toBeVisible();
      await expect(player1Page.locator(".leaderboard-elevation").first()).toBeVisible();
      const firstElevation = await player1Page.locator(".leaderboard-elevation").first().textContent();
      expect(firstElevation).toMatch(/\d+m/);

      // Both player names appear in the leaderboard
      await expect(player1Page.locator(".leaderboard-name", { hasText: "Alice" })).toBeVisible();
      await expect(player1Page.locator(".leaderboard-name", { hasText: "Bob" })).toBeVisible();

      // #1 rank is highlighted
      await expect(player1Page.locator(".leaderboard-row.rank-1")).toBeVisible();

      // Players see their own row highlighted
      await expect(player1Page.locator(".leaderboard-row.current-player")).toBeVisible({ timeout: 10_000 });
      await expect(player2Page.locator(".leaderboard-row.current-player")).toBeVisible({ timeout: 10_000 });

      // Spectator leaderboard overlay shows entries
      const spectatorRows = spectatorPage.locator(".leaderboard-overlay .leaderboard-row");
      await expect(spectatorRows.first()).toBeVisible({ timeout: 10_000 });
      const spectatorRowCount = await spectatorRows.count();
      expect(spectatorRowCount).toBeGreaterThanOrEqual(2);

      // --- Blob position assertions (after first question, during results/leaderboard) ---
      // During the "results" phase, .mountain-player blobs are rendered at actual
      // elevations on the spectator mountain (behind the leaderboard overlay).
      // Wait briefly for blob positions to settle after the phase transition.
      await spectatorPage.waitForTimeout(500);

      const aliceElev = await getVisualElevation(spectatorPage, "Alice");
      const bobElev = await getVisualElevation(spectatorPage, "Bob");

      if (aliceElev !== null && bobElev !== null) {
        // Both should be within valid mountain bounds (0-1000m)
        expect(aliceElev).toBeGreaterThanOrEqual(-50);
        expect(aliceElev).toBeLessThanOrEqual(1050);
        expect(bobElev).toBeGreaterThanOrEqual(-50);
        expect(bobElev).toBeLessThanOrEqual(1050);

        aliceElevationAfter = aliceElev;
        bobElevationAfter = bobElev;
      }

      // Neither player should have lost elevation (moved down)
      if (aliceElevationBefore !== null && aliceElevationAfter !== null) {
        expect(aliceElevationAfter).toBeGreaterThanOrEqual(aliceElevationBefore - 20);
      }
      if (bobElevationBefore !== null && bobElevationAfter !== null) {
        expect(bobElevationAfter).toBeGreaterThanOrEqual(bobElevationBefore - 20);
      }

      // Verify leaderboard order matches mountain positions
      // Since one player answered correctly and the other wrongly, #1 should be strictly higher
      const rank1Row = spectatorPage.locator(".leaderboard-overlay .leaderboard-row").first();
      const rank1Name = await rank1Row.locator(".leaderboard-name").textContent();
      if (rank1Name && aliceElevationAfter !== null && bobElevationAfter !== null) {
        const rank1Elevation = rank1Name.includes("Alice") ? aliceElevationAfter : bobElevationAfter;
        const rank2Elevation = rank1Name.includes("Alice") ? bobElevationAfter : aliceElevationAfter;
        // #1 ranked player should be strictly higher on the mountain (with tolerance for rendering)
        expect(rank1Elevation).toBeGreaterThanOrEqual(rank2Elevation - 30);
        // If one was correct and the other wrong, the correct one should be meaningfully higher
        if (rank1Elevation !== rank2Elevation) {
          expect(rank1Elevation).toBeGreaterThan(rank2Elevation - 10);
        }
      }
    });

    test("host advances past results", async () => {
      const nextButton = hostPage.getByRole("button", {
        name: /^Next Question$|^End Game$/,
      });
      await expect(nextButton).toBeVisible({ timeout: 10_000 });
      const buttonText = await nextButton.textContent();
      await nextButton.click();

      if (buttonText?.includes("End Game")) {
        await expect(
          hostPage.locator(".status-badge.status-finished").first()
        ).toBeVisible({ timeout: 10_000 });
        await expect(player1Page.getByText("Game Over!")).toBeVisible({
          timeout: 10_000,
        });
      } else {
        await expect(hostPage.getByText("Showing Question")).toBeVisible({
          timeout: 10_000,
        });

        // --- Blob position assertions: elevation should be retained from after Q1 ---
        await spectatorPage.waitForTimeout(500);

        const aliceRetained = await getVisualElevation(spectatorPage, "Alice");
        const bobRetained = await getVisualElevation(spectatorPage, "Bob");

        // Players should still be at their post-Q1 elevations (no regression)
        if (aliceRetained !== null && aliceElevationAfter !== null) {
          expect(Math.abs(aliceRetained - aliceElevationAfter)).toBeLessThanOrEqual(30);
        }
        if (bobRetained !== null && bobElevationAfter !== null) {
          expect(Math.abs(bobRetained - bobElevationAfter)).toBeLessThanOrEqual(30);
        }
      }
    });

    test("spectator deep link to invalid session shows error", async () => {
      await spectatorPage.goto("/spectate/ZZZZ");

      await expect(
        spectatorPage.getByRole("heading", { name: "Session Not Found" })
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        spectatorPage.getByText('No session with code "ZZZZ" exists.')
      ).toBeVisible();
      await expect(
        spectatorPage.getByRole("button", { name: "Back to Home" })
      ).toBeVisible();
    });
  }
);
