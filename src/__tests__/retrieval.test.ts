import { describe, it, expect } from "vitest";
import {
	cosineSimilarity,
	scopeBFS,
	searchCompartment,
} from "../core/similarity";
import { EmbeddingIndex, EmbeddingCache } from "../core/embedding";

// --- cosineSimilarity ---

describe("cosineSimilarity", () => {
	it("returns 1 for identical vectors", () => {
		const v = [1, 2, 3];
		expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
	});

	it("returns 0 for orthogonal vectors", () => {
		expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
	});

	it("returns -1 for opposite vectors", () => {
		expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
	});

	it("returns 0 for zero vector", () => {
		expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
	});

	it("handles high-dimensional vectors", () => {
		const a = Array.from({ length: 1536 }, (_, i) => Math.sin(i));
		const b = Array.from({ length: 1536 }, (_, i) => Math.cos(i));
		const score = cosineSimilarity(a, b);
		expect(score).toBeGreaterThan(-1);
		expect(score).toBeLessThan(1);
	});
});

// --- scopeBFS ---

describe("scopeBFS", () => {
	const links: Record<string, Record<string, number>> = {
		"a.md": { "b.md": 1, "c.md": 1 },
		"b.md": { "d.md": 1 },
		"c.md": {},
		"d.md": { "e.md": 1 },
		"e.md": {},
		"isolated.md": {},
	};

	it("returns direct neighbours at hop 1", () => {
		const result = scopeBFS("a.md", links, 1);
		expect(result.has("b.md")).toBe(true);
		expect(result.has("c.md")).toBe(true);
		expect(result.has("d.md")).toBe(false);
	});

	it("reaches 2-hop neighbours", () => {
		const result = scopeBFS("a.md", links, 2);
		expect(result.has("b.md")).toBe(true);
		expect(result.has("c.md")).toBe(true);
		expect(result.has("d.md")).toBe(true);
		expect(result.has("e.md")).toBe(false);
	});

	it("reaches 3-hop neighbours", () => {
		const result = scopeBFS("a.md", links, 3);
		expect(result.has("e.md")).toBe(true);
	});

	it("excludes source note", () => {
		const result = scopeBFS("a.md", links, 3);
		expect(result.has("a.md")).toBe(false);
	});

	it("does not reach isolated nodes", () => {
		const result = scopeBFS("a.md", links, 10);
		expect(result.has("isolated.md")).toBe(false);
	});

	it("traverses incoming links (bidirectional)", () => {
		// d.md has no outgoing link to a.md, but a.md→b.md→d.md
		const result = scopeBFS("d.md", links, 1);
		expect(result.has("b.md")).toBe(true);
		expect(result.has("e.md")).toBe(true);
	});

	it("returns empty set for isolated node at any depth", () => {
		const result = scopeBFS("isolated.md", links, 5);
		expect(result.size).toBe(0);
	});
});

// --- searchCompartment ---

describe("searchCompartment", () => {
	function makeCache(vec: number[]): EmbeddingCache {
		return {
			mtime: 0,
			title: vec,
			tags: vec,
			links: vec,
			content: vec,
			proposed: [],
		};
	}

	it("returns top-K results sorted by score", () => {
		const index = new EmbeddingIndex();
		index.set("close.md", makeCache([1, 0]));
		index.set("far.md", makeCache([0, 1]));
		index.set("medium.md", makeCache([0.7, 0.7]));

		const candidates = new Set(["close.md", "far.md", "medium.md"]);
		const results = searchCompartment([1, 0], candidates, index, "title", 2);

		expect(results).toHaveLength(2);
		expect(results[0].path).toBe("close.md");
		expect(results[0].score).toBeCloseTo(1.0);
	});

	it("returns fewer than K if not enough candidates", () => {
		const index = new EmbeddingIndex();
		index.set("only.md", makeCache([1, 0]));

		const results = searchCompartment(
			[1, 0],
			new Set(["only.md"]),
			index,
			"title",
			5
		);
		expect(results).toHaveLength(1);
	});

	it("returns empty for empty candidate set", () => {
		const index = new EmbeddingIndex();
		const results = searchCompartment(
			[1, 0],
			new Set(),
			index,
			"title",
			5
		);
		expect(results).toHaveLength(0);
	});

	it("skips candidates not in index", () => {
		const index = new EmbeddingIndex();
		index.set("exists.md", makeCache([1, 0]));

		const candidates = new Set(["exists.md", "missing.md"]);
		const results = searchCompartment([1, 0], candidates, index, "title", 5);
		expect(results).toHaveLength(1);
		expect(results[0].path).toBe("exists.md");
	});
});

