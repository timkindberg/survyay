import { expect, type Page } from "@playwright/test";

/**
 * Host creates a new session and returns the 4-letter session code.
 */
export async function hostCreateSession(hostPage: Page): Promise<string> {
  await hostPage.goto("/");
  await hostPage.getByRole("button", { name: "Host a Game" }).click();
  await hostPage.getByRole("button", { name: /\+ Create New Session/ }).click();

  const codeElement = hostPage.locator(".code-value");
  await expect(codeElement).toBeVisible({ timeout: 15_000 });
  const sessionCode = (await codeElement.textContent())!.trim();
  expect(sessionCode).toMatch(/^[A-Z]{4}$/);

  return sessionCode;
}

/**
 * Player joins a session with the given code and name.
 */
export async function playerJoin(
  page: Page,
  code: string,
  name: string
): Promise<void> {
  await page.goto("/");
  // Clear any stored sessions to prevent "Welcome Back!" rejoin panel
  await page.evaluate(() => localStorage.clear());

  await page.getByRole("button", { name: "Join Game" }).click();

  await page.getByPlaceholder("Join Code (e.g. ABCD)").fill(code);
  await page.getByPlaceholder("Your Name").fill(name);

  const joinButton = page.getByRole("button", { name: /^Join$/i });
  await expect(joinButton).toBeEnabled({ timeout: 20_000 });
  await joinButton.click();

  await expect(
    page.getByText("Waiting for host to start...")
  ).toBeVisible({ timeout: 15_000 });
}

/**
 * Spectator joins a session with the given code.
 */
export async function spectatorJoin(
  page: Page,
  code: string
): Promise<void> {
  await page.goto("/");
  await page.getByRole("button", { name: "Spectate" }).click();

  await page.getByPlaceholder("Code").fill(code);
  await page.getByRole("button", { name: "Watch Game" }).click();

  await expect(page.locator(".join-code")).toContainText(code, {
    timeout: 10_000,
  });
}

/**
 * Host advances the game by clicking the specified action button.
 */
export async function hostAdvance(
  page: Page,
  buttonText: string | RegExp
): Promise<void> {
  const button = page.getByRole("button", { name: buttonText });
  await expect(button).toBeVisible({ timeout: 10_000 });
  await expect(button).toBeEnabled({ timeout: 10_000 });
  await button.click();
}

/**
 * Player answers a question by clicking the nth option button.
 */
export async function playerAnswer(
  page: Page,
  optionIndex: number
): Promise<void> {
  const optionButtons = page.locator(".options button");
  await expect(optionButtons.first()).toBeVisible({ timeout: 10_000 });
  await optionButtons.nth(optionIndex).click();
}

/**
 * Builds a complete elevation map from ALL checkpoint markers on the mountain,
 * then interpolates to find the visual elevation of a given player blob.
 *
 * The algorithm:
 * 1. Finds ALL `<text data-elevation="...">` elements inside `.mountain`
 * 2. Deduplicates by elevation value (left/right labels share the same elevation)
 * 3. Sorts by screen Y to build a lookup table: [{elevation, y}, ...]
 * 4. Finds the blob by `data-player-name` and uses its bottom Y (standing position)
 * 5. Interpolates between the two bracketing checkpoints
 *
 * Screen Y is inverted: smaller Y = higher on screen = higher elevation.
 * Checkpoints are every 100m from 0m to 1000m.
 *
 * @param page - Playwright page (spectator page has the widest mountain view)
 * @param playerName - The player's display name (e.g. "Alice")
 * @returns Elevation in meters (0-1000), or null if insufficient data
 */
export async function getVisualElevation(
  page: Page,
  playerName: string
): Promise<number | null> {
  return page.evaluate((name) => {
    const mountain = document.querySelector(".mountain");
    if (!mountain) return null;

    // --- Step 1: Build the complete elevation map from all checkpoint markers ---
    const elevationMap = buildElevationMap(mountain);
    if (elevationMap.length < 2) return null;

    // --- Step 2: Find the blob's standing Y position ---
    const blob = mountain.querySelector(`[data-player-name="${name}"]`);
    if (!blob) return null;

    const blobBottomY = blob.getBoundingClientRect().bottom;

    // --- Step 3: Look up elevation from the map ---
    return lookupElevation(blobBottomY, elevationMap);

    // --- Helper: collect and deduplicate all checkpoint markers ---
    function buildElevationMap(
      container: Element
    ): Array<{ elevation: number; y: number }> {
      const elements = Array.from(
        container.querySelectorAll("svg text[data-elevation]")
      );

      const seen = new Set<number>();
      const entries: Array<{ elevation: number; y: number }> = [];

      for (const el of elements) {
        const elevation = Number(el.getAttribute("data-elevation"));
        if (isNaN(elevation) || seen.has(elevation)) continue;
        seen.add(elevation);

        const rect = el.getBoundingClientRect();
        const centerY = rect.top + rect.height / 2;
        entries.push({ elevation, y: centerY });
      }

      // Sort by screen Y ascending (top of screen first = highest elevation)
      entries.sort((a, b) => a.y - b.y);
      return entries;
    }

    // --- Helper: interpolate a Y position to an elevation using the map ---
    function lookupElevation(
      y: number,
      map: Array<{ elevation: number; y: number }>
    ): number {
      // Edge case: above the highest checkpoint
      if (y <= map[0]!.y) {
        return map[0]!.elevation;
      }

      // Edge case: below the lowest checkpoint
      if (y >= map[map.length - 1]!.y) {
        return map[map.length - 1]!.elevation;
      }

      // Find the two bracketing checkpoints
      for (let i = 0; i < map.length - 1; i++) {
        const upper = map[i]!; // smaller Y = higher elevation
        const lower = map[i + 1]!; // larger Y = lower elevation

        if (y >= upper.y && y <= lower.y) {
          const fraction = (y - upper.y) / (lower.y - upper.y);
          const elevation =
            upper.elevation + fraction * (lower.elevation - upper.elevation);
          return Math.round(elevation);
        }
      }

      // Fallback (should not happen if map is well-formed)
      return map[map.length - 1]!.elevation;
    }
  }, playerName);
}

/**
 * Returns the X positions of all ropes as percentages of the mountain container width.
 *
 * @param page - Playwright page
 * @returns Array of {label, xPercent} sorted left to right, or null if not found
 */
export async function getRopePositions(
  page: Page
): Promise<Array<{ label: string; xPercent: number }> | null> {
  return page.evaluate(() => {
    const mountain = document.querySelector(".mountain");
    if (!mountain) return null;

    const mountainRect = mountain.getBoundingClientRect();
    if (mountainRect.width === 0) return null;

    const ropeGroups = Array.from(
      mountain.querySelectorAll("svg g[data-rope-label]")
    );
    if (ropeGroups.length === 0) return null;

    const results: Array<{ label: string; xPercent: number }> = [];

    for (const group of ropeGroups) {
      const label = group.getAttribute("data-rope-label") ?? "?";

      // Find vertical line elements inside the group
      const lines = Array.from(group.querySelectorAll("line"));
      if (lines.length === 0) continue;

      // Get bounding rects of lines to find the rope center X
      // The vertical ropes have x1/x2 attributes - find leftmost and rightmost
      let minX = Infinity;
      let maxX = -Infinity;

      for (const line of lines) {
        const lineRect = line.getBoundingClientRect();
        if (lineRect.left < minX) minX = lineRect.left;
        if (lineRect.right > maxX) maxX = lineRect.right;
      }

      if (minX === Infinity || maxX === -Infinity) continue;

      const ropeCenterX = (minX + maxX) / 2;
      const xPercent =
        ((ropeCenterX - mountainRect.left) / mountainRect.width) * 100;

      results.push({ label, xPercent });
    }

    // Sort by xPercent (left to right)
    results.sort((a, b) => a.xPercent - b.xPercent);

    return results;
  });
}

/**
 * Returns the blob's center X position as a percentage of mountain width.
 *
 * @param page - Playwright page
 * @param playerName - The player's display name
 * @returns Percentage (0-100) of mountain width, or null if not found
 */
export async function getBlobHorizontalPosition(
  page: Page,
  playerName: string
): Promise<number | null> {
  return page.evaluate((name) => {
    const mountain = document.querySelector(".mountain");
    if (!mountain) return null;

    const mountainRect = mountain.getBoundingClientRect();
    if (mountainRect.width === 0) return null;

    const blob = mountain.querySelector(`[data-player-name="${name}"]`);
    if (!blob) return null;

    const blobRect = blob.getBoundingClientRect();
    const centerX = blobRect.left + blobRect.width / 2;
    return ((centerX - mountainRect.left) / mountainRect.width) * 100;
  }, playerName);
}

/**
 * Pure function: returns which rope the blob is closest to and the distance.
 *
 * @param blobXPercent - Blob's center X as percentage of mountain width
 * @param ropePositions - Array of rope positions from getRopePositions()
 * @returns The closest rope label and distance, or null if no ropes
 */
export function getClosestRope(
  blobXPercent: number,
  ropePositions: Array<{ label: string; xPercent: number }>
): { label: string; distance: number } | null {
  if (ropePositions.length === 0) return null;

  let closest: { label: string; distance: number } | null = null;

  for (const rope of ropePositions) {
    const distance = Math.abs(blobXPercent - rope.xPercent);
    if (!closest || distance < closest.distance) {
      closest = { label: rope.label, distance };
    }
  }

  return closest;
}
