import { describe, it, expect } from "vitest";

describe("Test setup", () => {
  it("vitest is working", () => {
    expect(1 + 1).toBe(2);
  });

  it("can import from src", async () => {
    const { generateBlob } = await import("../../src/lib/blobGenerator");
    const blob = generateBlob("test");
    expect(blob.name).toBe("test");
  });
});
