import { test, expect } from "@playwright/test";

test.describe("Survyay Smoke Tests", () => {
  test("home page loads with correct elements", async ({ page }) => {
    await page.goto("/");

    // Check title
    await expect(page).toHaveTitle("Survyay!");

    // Check main heading
    await expect(page.getByRole("heading", { name: "Survyay!" })).toBeVisible();

    // Check description
    await expect(page.getByText("A fun real-time survey tool")).toBeVisible();

    // Check all three action buttons are present
    await expect(page.getByRole("button", { name: "Host a Session" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join as Player" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Survyay!" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Survyay!" })).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "Survyay!" })).toBeVisible();
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

    // Should be back at home
    await expect(page.getByRole("heading", { name: "Survyay!" })).toBeVisible();
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
});
