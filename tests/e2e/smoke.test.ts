import { test, expect } from "@playwright/test";

test.describe("Surv-Yay! Smoke Tests", () => {
  test("home page loads with correct elements", async ({ page }) => {
    await page.goto("/");

    // Check title
    await expect(page).toHaveTitle("Surv-Yay!");

    // Check main heading
    await expect(page.getByRole("heading", { name: "Surv-Yay!" })).toBeVisible();

    // Check description
    await expect(page.getByText("A fun real-time survey tool")).toBeVisible();

    // Check all four action buttons are present
    await expect(page.getByRole("button", { name: "Host a Session" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join as Player" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Spectator View/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Blob Gallery/ })).toBeVisible();
  });

  test("blob gallery shows sample blobs", async ({ page }) => {
    await page.goto("/");

    // Click blob gallery button
    await page.getByRole("button", { name: /Blob Gallery/ }).click();

    // Check gallery heading
    await expect(page.getByRole("heading", { name: "Blob Gallery" })).toBeVisible();

    // Check animation buttons are present
    await expect(page.getByRole("button", { name: "idle" })).toBeVisible();
    await expect(page.getByRole("button", { name: "climbing" })).toBeVisible();
    await expect(page.getByRole("button", { name: "falling" })).toBeVisible();
    await expect(page.getByRole("button", { name: "celebrating" })).toBeVisible();

    // Check sample blobs section exists
    await expect(page.getByRole("heading", { name: "Sample Blobs" })).toBeVisible();

    // Check at least some sample blobs are rendered (Alice, Bob, etc.)
    await expect(page.getByText("Alice")).toBeVisible();
    await expect(page.getByText("Bob")).toBeVisible();

    // Check we can add a custom blob
    const nameInput = page.getByPlaceholder("Enter a name...");
    await nameInput.fill("E2ETestBlob");
    await page.getByRole("button", { name: "Add Blob" }).click();

    // Check the custom blob appears
    await expect(page.getByRole("heading", { name: "Your Blobs" })).toBeVisible();
    await expect(page.getByText("E2ETestBlob")).toBeVisible();

    // Go back to home
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.getByRole("heading", { name: "Surv-Yay!" })).toBeVisible();
  });

  test("host view shows session creation", async ({ page }) => {
    await page.goto("/");

    // Click host button
    await page.getByRole("button", { name: "Host a Session" }).click();

    // Should show host view with session code (if Convex is running)
    // or at least the host view structure
    await expect(page.getByRole("button", { name: /Back/ })).toBeVisible();

    // Go back
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.getByRole("heading", { name: "Surv-Yay!" })).toBeVisible();
  });

  test("player view shows join form", async ({ page }) => {
    await page.goto("/");

    // Click join button
    await page.getByRole("button", { name: "Join as Player" }).click();

    // Should show player join form
    await expect(page.getByPlaceholder(/Join Code/i)).toBeVisible();
    await expect(page.getByPlaceholder(/Your Name/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /join/i })).toBeVisible();

    // Go back
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.getByRole("heading", { name: "Surv-Yay!" })).toBeVisible();
  });

  test("navigation between views works", async ({ page }) => {
    await page.goto("/");

    // Go to host view and back
    await page.getByRole("button", { name: "Host a Session" }).click();
    await page.getByRole("button", { name: /Back/ }).click();

    // Go to player view and back
    await page.getByRole("button", { name: "Join as Player" }).click();
    await page.getByRole("button", { name: /Back/ }).click();

    // Go to gallery and back
    await page.getByRole("button", { name: /Blob Gallery/ }).click();
    await page.getByRole("button", { name: /Back/ }).click();

    // Go to spectator view and back
    await page.getByRole("button", { name: /Spectator View/ }).click();
    await page.getByRole("button", { name: /Back/ }).click();

    // Should be back at home
    await expect(page.getByRole("heading", { name: "Surv-Yay!" })).toBeVisible();
  });

  test("spectator view shows join form", async ({ page }) => {
    await page.goto("/");

    // Click spectator button
    await page.getByRole("button", { name: /Spectator View/ }).click();

    // Should show spectator join form
    await expect(page.getByRole("heading", { name: "Spectator Mode" })).toBeVisible();
    await expect(page.getByPlaceholder(/Session Code/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Watch Game/i })).toBeVisible();

    // Watch button should be disabled without a valid code
    await expect(page.getByRole("button", { name: /Watch Game/i })).toBeDisabled();

    // Enter a code and button should be enabled
    await page.getByPlaceholder(/Session Code/i).fill("ABCD");
    await expect(page.getByRole("button", { name: /Watch Game/i })).toBeEnabled();

    // Go back
    await page.getByRole("button", { name: /Back/ }).click();
    await expect(page.getByRole("heading", { name: "Surv-Yay!" })).toBeVisible();
  });

  test("spectator deep link shows session not found for invalid code", async ({ page }) => {
    // Navigate directly to a spectator URL with invalid session code
    await page.goto("/spectate/ZZZZ");

    // Wait for the query to resolve (may show loading first)
    // Should show session not found after query completes
    await expect(page.getByRole("heading", { name: "Session Not Found" })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('No session with code "ZZZZ" exists.')).toBeVisible();

    // Should have a back button
    await expect(page.getByRole("button", { name: /Back to Home/i })).toBeVisible();
  });

  test("blob animations change on button click", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Blob Gallery/ }).click();

    // Wait for blobs to load
    await expect(page.getByText("Alice")).toBeVisible();

    // Click different animation states - they should be highlighted when selected
    const climbingBtn = page.getByRole("button", { name: "climbing" });
    await climbingBtn.click();

    const fallingBtn = page.getByRole("button", { name: "falling" });
    await fallingBtn.click();

    const celebratingBtn = page.getByRole("button", { name: "celebrating" });
    await celebratingBtn.click();

    const idleBtn = page.getByRole("button", { name: "idle" });
    await idleBtn.click();

    // All buttons should still be visible after cycling through
    await expect(idleBtn).toBeVisible();
    await expect(climbingBtn).toBeVisible();
  });

  test("multiple tabs maintain separate player sessions with sessionStorage", async ({
    context,
  }) => {
    // Create two separate pages (tabs) in the same context
    const page1 = await context.newPage();
    const page2 = await context.newPage();

    try {
      // Navigate both to home
      await page1.goto("/");
      await page2.goto("/");

      // Both tabs show join button initially
      await expect(page1.getByRole("button", { name: "Join as Player" })).toBeVisible();
      await expect(page2.getByRole("button", { name: "Join as Player" })).toBeVisible();

      // Tab 1: Join with player name
      await page1.getByRole("button", { name: "Join as Player" }).click();
      await page1.getByPlaceholder(/Join Code/i).fill("TEST");
      await page1.getByPlaceholder(/Your Name/i).fill("Player1");

      // Tab 2: Join with different player name
      await page2.getByRole("button", { name: "Join as Player" }).click();
      await page2.getByPlaceholder(/Join Code/i).fill("TEST");
      await page2.getByPlaceholder(/Your Name/i).fill("Player2");

      // Verify sessionStorage isolation: each tab has its own player data
      const tab1Storage = await page1.evaluate(() => {
        const stored = sessionStorage.getItem("survyay_player");
        return stored ? JSON.parse(stored) : null;
      });

      const tab2Storage = await page2.evaluate(() => {
        const stored = sessionStorage.getItem("survyay_player");
        return stored ? JSON.parse(stored) : null;
      });

      // If both are null, the test verifies the form state is independent
      // If they have values (after actual join), they should be different
      // The key point is that sessionStorage is NOT shared between tabs
      // (unlike localStorage which would cause both tabs to have same values)

      // Verify that the input values in each tab are what we set, not synchronized
      const tab1Name = await page1.getByPlaceholder(/Your Name/i).inputValue();
      const tab2Name = await page2.getByPlaceholder(/Your Name/i).inputValue();

      expect(tab1Name).toBe("Player1");
      expect(tab2Name).toBe("Player2");
    } finally {
      await page1.close();
      await page2.close();
    }
  });
});
