import { describe, it, expect } from "vitest";
import {
  generateBlob,
  getDisplayName,
  type BlobConfig,
  type BlobShape,
  type EyeStyle,
  type HairStyle,
  type Accessory,
} from "../../src/lib/blobGenerator";

describe("generateBlob", () => {
  describe("determinism", () => {
    it("generates the same blob for the same name", () => {
      const blob1 = generateBlob("Alice");
      const blob2 = generateBlob("Alice");

      expect(blob1).toEqual(blob2);
    });

    it("generates the same visual blob regardless of case", () => {
      const blob1 = generateBlob("Bob");
      const blob2 = generateBlob("bob");
      const blob3 = generateBlob("BOB");

      // All three should have the same seed
      expect(blob1.seed).toBe(blob2.seed);
      expect(blob2.seed).toBe(blob3.seed);

      // All visual properties should match across all three
      expect(blob1.body).toEqual(blob2.body);
      expect(blob2.body).toEqual(blob3.body);
      expect(blob1.eyes).toEqual(blob2.eyes);
      expect(blob2.eyes).toEqual(blob3.eyes);
      expect(blob1.features).toEqual(blob2.features);
      expect(blob2.features).toEqual(blob3.features);
      expect(blob1.accessory).toBe(blob2.accessory);
      expect(blob2.accessory).toBe(blob3.accessory);
    });

    it("generates the same visual blob with leading/trailing whitespace", () => {
      const blob1 = generateBlob("Charlie");
      const blob2 = generateBlob("  Charlie  ");

      // Seed and visual properties should match (name field may differ)
      expect(blob1.seed).toBe(blob2.seed);
      expect(blob1.body).toEqual(blob2.body);
      expect(blob1.eyes).toEqual(blob2.eyes);
    });

    it("is stable across multiple calls", () => {
      const name = "TestUser123";
      const results = Array.from({ length: 100 }, () => generateBlob(name));

      // All 100 should be identical
      results.forEach((blob) => {
        expect(blob.seed).toBe(results[0]!.seed);
        expect(blob.body.color).toBe(results[0]!.body.color);
      });
    });
  });

  describe("uniqueness", () => {
    it("generates different blobs for different names", () => {
      const blob1 = generateBlob("Alice");
      const blob2 = generateBlob("Bob");

      // Seeds should be different
      expect(blob1.seed).not.toBe(blob2.seed);
    });

    it("generates varied output across many names", () => {
      const names = [
        "Alice", "Bob", "Charlie", "Diana", "Eve", "Frank",
        "Grace", "Henry", "Ivy", "Jack", "Kate", "Leo",
        "Mia", "Noah", "Olivia", "Pete", "Quinn", "Rose",
        "Sam", "Tina", "Uma", "Vic", "Wendy", "Xander",
      ];

      const blobs = names.map(generateBlob);
      const seeds = new Set(blobs.map((b) => b.seed));

      // All seeds should be unique
      expect(seeds.size).toBe(names.length);
    });
  });

  describe("output structure", () => {
    it("returns a valid BlobConfig", () => {
      const blob = generateBlob("TestUser");

      expect(blob).toHaveProperty("name", "TestUser");
      expect(blob).toHaveProperty("body");
      expect(blob).toHaveProperty("eyes");
      expect(blob).toHaveProperty("features");
      expect(blob).toHaveProperty("accessory");
      expect(blob).toHaveProperty("seed");

      expect(blob.body).toHaveProperty("shape");
      expect(blob.body).toHaveProperty("color");
      expect(blob.body).toHaveProperty("highlightColor");

      expect(blob.eyes).toHaveProperty("style");
      expect(blob.eyes).toHaveProperty("color");

      expect(blob.features).toHaveProperty("rosyCheeks");
      expect(blob.features).toHaveProperty("hair");
    });

    it("eye color is always dark (not matching body)", () => {
      // Generate many blobs and check eye colors are always dark
      const names = Array.from({ length: 50 }, (_, i) => `User${i}`);
      const blobs = names.map(generateBlob);

      const darkColors = ["#2C3E50", "#1A1A2E", "#34495E", "#2D3436", "#5D4E60"];

      blobs.forEach((blob) => {
        expect(darkColors).toContain(blob.eyes.color);
        // Eye color should never match body color
        expect(blob.eyes.color).not.toBe(blob.body.color);
      });
    });
  });

  describe("coverage of all options", () => {
    // Generate a large sample to check all options are reachable
    const sampleSize = 500;
    const sampleNames = Array.from({ length: sampleSize }, (_, i) => `TestUser${i}XYZ${i * 7}`);
    const sampleBlobs = sampleNames.map(generateBlob);

    it("uses all body shapes", () => {
      const shapes: BlobShape[] = ["round", "tall", "wide", "bean", "pear", "square", "ghost", "droplet"];
      const foundShapes = new Set(sampleBlobs.map((b) => b.body.shape));

      shapes.forEach((shape) => {
        expect(foundShapes.has(shape), `Shape "${shape}" should be reachable`).toBe(true);
      });
    });

    it("uses all eye styles", () => {
      const eyeStyles: EyeStyle[] = ["dots", "wide", "sleepy", "excited", "angry", "wink", "dizzy", "hearts", "side-eye", "sparkle"];
      const foundStyles = new Set(sampleBlobs.map((b) => b.eyes.style));

      eyeStyles.forEach((style) => {
        expect(foundStyles.has(style), `Eye style "${style}" should be reachable`).toBe(true);
      });
    });

    it("uses all hair styles", () => {
      const hairStyles: HairStyle[] = ["none", "tuft", "spiky", "curly", "swoosh", "ponytail", "single-curl"];
      const foundHair = new Set(sampleBlobs.map((b) => b.features.hair));

      hairStyles.forEach((style) => {
        expect(foundHair.has(style), `Hair style "${style}" should be reachable`).toBe(true);
      });
    });

    it("uses all accessories", () => {
      const accessories: Accessory[] = ["none", "hat", "bow", "glasses", "bandana", "monocle", "bowtie", "crown", "headphones", "flower"];
      const foundAccessories = new Set(sampleBlobs.map((b) => b.accessory));

      accessories.forEach((accessory) => {
        expect(foundAccessories.has(accessory), `Accessory "${accessory}" should be reachable`).toBe(true);
      });
    });

    it("generates both rosy and non-rosy cheeks", () => {
      const hasRosy = sampleBlobs.some((b) => b.features.rosyCheeks);
      const hasNonRosy = sampleBlobs.some((b) => !b.features.rosyCheeks);

      expect(hasRosy).toBe(true);
      expect(hasNonRosy).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const blob = generateBlob("");

      expect(blob.name).toBe("");
      expect(blob.seed).toBeTypeOf("number");
      expect(blob.body.shape).toBeTruthy();
    });

    it("handles special characters", () => {
      const blob = generateBlob("Test!@#$%^&*()");

      expect(blob.name).toBe("Test!@#$%^&*()");
      expect(blob.seed).toBeTypeOf("number");
    });

    it("handles unicode/emoji", () => {
      const blob = generateBlob("User🎮🎯");

      expect(blob.name).toBe("User🎮🎯");
      expect(blob.seed).toBeTypeOf("number");
    });

    it("handles very long names", () => {
      const longName = "A".repeat(1000);
      const blob = generateBlob(longName);

      expect(blob.name).toBe(longName);
      expect(blob.seed).toBeTypeOf("number");
    });

    it("handles numeric strings", () => {
      const blob = generateBlob("12345");

      expect(blob.name).toBe("12345");
      expect(blob.seed).toBeTypeOf("number");
    });
  });
});

describe("getDisplayName", () => {
  it("returns short names unchanged", () => {
    expect(getDisplayName("Alice")).toBe("Alice");
    expect(getDisplayName("Bob")).toBe("Bob");
    expect(getDisplayName("1234567890")).toBe("1234567890"); // exactly 10
  });

  it("truncates long names with ellipsis", () => {
    expect(getDisplayName("Christopher")).toBe("Christoph…");
    expect(getDisplayName("VeryLongUsername")).toBe("VeryLongU…");
  });

  it("trims whitespace before checking length", () => {
    expect(getDisplayName("  Alice  ")).toBe("Alice");
    expect(getDisplayName("  Christopher  ")).toBe("Christoph…");
  });
});
