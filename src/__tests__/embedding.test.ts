import { describe, it, expect } from "vitest";
import { hashPath, EmbeddingIndex, ShadowFile } from "../core/embedding";

// --- hashPath ---

describe("hashPath", () => {
	it("returns consistent hash for same path", () => {
		expect(hashPath("notes/test.md")).toBe(hashPath("notes/test.md"));
	});

	it("returns different hashes for different paths", () => {
		expect(hashPath("a.md")).not.toBe(hashPath("b.md"));
	});

	it("handles paths with special characters", () => {
		const hash = hashPath("folder/sub folder/my note (2024).md");
		expect(typeof hash).toBe("string");
		expect(hash.length).toBeGreaterThan(0);
	});

	it("handles empty string", () => {
		const hash = hashPath("");
		expect(typeof hash).toBe("string");
	});
});

// --- EmbeddingIndex ---

describe("EmbeddingIndex", () => {
	function makeShadow(): ShadowFile {
		return {
			mtime: Date.now(),
			title: [1, 2, 3],
			tags: [4, 5, 6],
			links: [7, 8, 9],
			content: [10, 11, 12],
			proposed: [],
		};
	}

	it("stores and retrieves entries", () => {
		const index = new EmbeddingIndex();
		const shadow = makeShadow();
		index.set("test.md", shadow);
		expect(index.get("test.md")).toBe(shadow);
	});

	it("returns undefined for missing entries", () => {
		const index = new EmbeddingIndex();
		expect(index.get("missing.md")).toBeUndefined();
	});

	it("deletes entries", () => {
		const index = new EmbeddingIndex();
		index.set("test.md", makeShadow());
		index.delete("test.md");
		expect(index.get("test.md")).toBeUndefined();
	});

	it("tracks size", () => {
		const index = new EmbeddingIndex();
		expect(index.size()).toBe(0);
		index.set("a.md", makeShadow());
		index.set("b.md", makeShadow());
		expect(index.size()).toBe(2);
	});

	it("provides reverse hash lookup", () => {
		const index = new EmbeddingIndex();
		index.set("notes/test.md", makeShadow());
		const hash = hashPath("notes/test.md");
		expect(index.notePathForHash(hash)).toBe("notes/test.md");
	});

	it("clears all entries", () => {
		const index = new EmbeddingIndex();
		index.set("a.md", makeShadow());
		index.set("b.md", makeShadow());
		index.clear();
		expect(index.size()).toBe(0);
		expect(index.get("a.md")).toBeUndefined();
	});

	it("iterates all entries", () => {
		const index = new EmbeddingIndex();
		index.set("a.md", makeShadow());
		index.set("b.md", makeShadow());

		const paths: string[] = [];
		for (const [path] of index.allEntries()) {
			paths.push(path);
		}
		expect(paths).toContain("a.md");
		expect(paths).toContain("b.md");
	});
});
