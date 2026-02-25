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

describe("concurrent lock access", () => {
	it("serializes parallel writes via lock", async () => {
		const path = join(tmpDir, "counter.jsonl");
		await writeJsonl(path, [{ id: "c1", version: 1, count: 0 }]);

		// 5 concurrent increment operations — without serialization, count would be wrong
		const increments = Array.from({ length: 5 }, () =>
			(async () => {
				await acquireLock(path);
				try {
					const records = await readJsonl<{ id: string; version: number; count: number }>(path);
					const current = records[0]?.count ?? 0;
					await Bun.sleep(5); // small delay to increase race chance without lock
					await writeJsonl(path, [{ id: "c1", version: 1, count: current + 1 }]);
				} finally {
					releaseLock(path);
				}
			})(),
		);

		await Promise.all(increments);

		const result = await readJsonl<{ id: string; version: number; count: number }>(path);
		expect(result[0]?.count).toBe(5);
	});

	it("cleans up stale lock and acquires successfully", async () => {
		const path = join(tmpDir, "stale.jsonl");
		const lock = `${path}.lock`;

		// Create a stale lock file (older than the 30s LOCK_STALE_MS threshold)
		await Bun.write(lock, "");
		const { utimes } = await import("node:fs/promises");
		const staleTime = new Date(Date.now() - 31_000);
		await utimes(lock, staleTime, staleTime);

		// Should remove the stale lock and acquire successfully
		await acquireLock(path);
		releaseLock(path);
	});

	it("throws timeout error when lock is held", async () => {
		const path = join(tmpDir, "locked.jsonl");
		const lock = `${path}.lock`;

		// Create a fresh (non-stale) lock to simulate another holder
		await Bun.write(lock, "");

		await expect(
			Promise.race([
				acquireLock(path),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error("test timed out")), 6_000),
				),
			]),
		).rejects.toThrow(/timeout/i);

		// Cleanup the manually created lock
		releaseLock(path);
	}, 10_000);
});
