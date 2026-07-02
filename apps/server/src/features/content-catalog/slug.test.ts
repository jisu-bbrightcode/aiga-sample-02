import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveSlug, slugify } from "./slug.js";

describe("slugify", () => {
  it("kebab-cases ascii titles", () => {
    assert.equal(slugify("AI Medical Consultation Guide"), "ai-medical-consultation-guide");
  });

  it("collapses punctuation and trims stray hyphens", () => {
    assert.equal(slugify("  Hello, World!!  "), "hello-world");
  });

  it("returns empty string when there is no usable ascii (e.g. Korean)", () => {
    assert.equal(slugify("의료 상담"), "");
  });
});

describe("deriveSlug", () => {
  it("falls back to an id-derived stub when the title yields no slug", () => {
    assert.equal(deriveSlug("의료 상담", "abcdef12-0000-4000-8000-000000000000"), "content-abcdef12");
  });

  it("uses the slugified title when available", () => {
    assert.equal(deriveSlug("First Post", "id"), "first-post");
  });
});
