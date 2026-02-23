import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
	acquireLock,
	appendJsonl,
	dedupById,
	getVersions,
	readJsonl,
	releaseLock,
	writeJsonl,
} from "./store.ts";

const tmpDir = join(import.meta.dir, "../.test-tmp-store");

beforeEach(() => {
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	if (existsSync(tmpDir)) {
		rmSync(tmpDir, { recursive: true });
	}
});

describe("readJsonl", () => {
	it("returns empty array for non-existent file", async () => {
		const result = await readJsonl(join(tmpDir, "nope.jsonl"));
		expect(result).toEqual([]);
	});

	it("reads JSONL records", async () => {
		const path = join(tmpDir, "test.jsonl");
		await Bun.write(
			path,
			`{"id":"a1","version":1,"name":"foo"}\n{"id":"a2","version":1,"name":"bar"}\n`,
		);
		const result = await readJsonl<{ id: string; version: number; name: string }>(path);
		expect(result).toHaveLength(2);
		expect(result[0]?.name).toBe("foo");
		expect(result[1]?.name).toBe("bar");
	});

	it("skips empty lines", async () => {
		const path = join(tmpDir, "test.jsonl");
		await Bun.write(path, `{"id":"a1","version":1}\n\n{"id":"a2","version":1}\n`);
		const result = await readJsonl<{ id: string; version: number }>(path);
		expect(result).toHaveLength(2);
	});
});

describe("writeJsonl", () => {
	it("writes records atomically", async () => {
		const path = join(tmpDir, "test.jsonl");
		const records = [
			{ id: "a1", version: 1, name: "foo" },
			{ id: "a2", version: 1, name: "bar" },
		];
		await writeJsonl(path, records);
		const result = await readJsonl<{ id: string; version: number; name: string }>(path);
		expect(result).toHaveLength(2);
	});

	it("overwrites existing file", async () => {
		const path = join(tmpDir, "test.jsonl");
		await writeJsonl(path, [{ id: "a1", version: 1 }]);
		await writeJsonl(path, [{ id: "a2", version: 1 }]);
		const result = await readJsonl<{ id: string; version: number }>(path);
		expect(result).toHaveLength(1);
		expect(result[0]?.id).toBe("a2");
	});
});

describe("appendJsonl", () => {
	it("appends to existing file", async () => {
		const path = join(tmpDir, "test.jsonl");
		await appendJsonl(path, { id: "a1", version: 1 });
		await appendJsonl(path, { id: "a1", version: 2 });
		const result = await readJsonl<{ id: string; version: number }>(path);
		expect(result).toHaveLength(2);
	});

	it("creates file if not exists", async () => {
		const path = join(tmpDir, "new.jsonl");
		await appendJsonl(path, { id: "x1", version: 1 });
		const result = await readJsonl<{ id: string; version: number }>(path);
		expect(result).toHaveLength(1);
	});
});

describe("dedupById", () => {
	it("returns latest version per id", () => {
		const records = [
			{ id: "a1", version: 1, name: "foo" },
			{ id: "a1", version: 2, name: "foo-updated" },
			{ id: "a2", version: 1, name: "bar" },
		];
		const result = dedupById(records);
		expect(result).toHaveLength(2);
		const a1 = result.find((r) => r.id === "a1");
		expect(a1?.name).toBe("foo-updated");
		expect(a1?.version).toBe(2);
	});

	it("handles empty array", () => {
		expect(dedupById([])).toEqual([]);
	});
});

describe("getVersions", () => {
	it("returns all versions sorted asc", () => {
		const records = [
			{ id: "a1", version: 3 },
			{ id: "a1", version: 1 },
			{ id: "a2", version: 1 },
			{ id: "a1", version: 2 },
		];
		const result = getVersions(records, "a1");
		expect(result.map((r) => r.version)).toEqual([1, 2, 3]);
	});
});

describe("acquireLock / releaseLock", () => {
	it("acquires and releases lock", async () => {
		const path = join(tmpDir, "test.jsonl");
		await acquireLock(path);
		releaseLock(path);
		// Should be able to acquire again after release
		await acquireLock(path);
		releaseLock(path);
	});
});
