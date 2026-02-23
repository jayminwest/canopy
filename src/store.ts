import { randomBytes } from "node:crypto";
import { closeSync, constants, openSync, renameSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { LOCK_RETRY_MS, LOCK_STALE_MS, LOCK_TIMEOUT_MS } from "./types.ts";

function lockPath(filePath: string): string {
	return `${filePath}.lock`;
}

export async function acquireLock(filePath: string): Promise<void> {
	const lock = lockPath(filePath);
	const deadline = Date.now() + LOCK_TIMEOUT_MS;

	while (Date.now() < deadline) {
		try {
			// O_CREAT | O_EXCL — atomic, fails if exists
			const fd = openSync(lock, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY);
			closeSync(fd);
			return;
		} catch (err: unknown) {
			if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

			// Check if stale
			try {
				const stat = statSync(lock);
				const age = Date.now() - stat.mtimeMs;
				if (age > LOCK_STALE_MS) {
					unlinkSync(lock);
					continue;
				}
			} catch {
				// Lock was removed between our check and stat — retry
				continue;
			}

			await Bun.sleep(LOCK_RETRY_MS);
		}
	}

	throw new Error(`Timeout acquiring lock on ${filePath} after ${LOCK_TIMEOUT_MS}ms`);
}

export function releaseLock(filePath: string): void {
	try {
		unlinkSync(lockPath(filePath));
	} catch {
		// Best-effort release
	}
}

export async function readJsonl<T>(filePath: string): Promise<T[]> {
	try {
		const text = await Bun.file(filePath).text();
		const records: T[] = [];

		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				records.push(JSON.parse(trimmed) as T);
			} catch {
				// Skip malformed lines
			}
		}

		return records;
	} catch {
		return [];
	}
}

export async function writeJsonl<T>(filePath: string, records: T[]): Promise<void> {
	const dir = filePath.substring(0, filePath.lastIndexOf("/"));
	const tmp = join(dir, `.jsonl.tmp.${randomBytes(4).toString("hex")}`);

	const lines = records.map((r) => JSON.stringify(r)).join("\n");
	const content = lines ? `${lines}\n` : "";

	await Bun.write(tmp, content);
	renameSync(tmp, filePath);
}

export async function appendJsonl<T>(filePath: string, record: T): Promise<void> {
	const line = `${JSON.stringify(record)}\n`;

	// Check if file exists and has content
	let existing = "";
	try {
		existing = await Bun.file(filePath).text();
	} catch {
		existing = "";
	}

	const content = existing ? existing + line : line;

	const dir = filePath.substring(0, filePath.lastIndexOf("/"));
	const tmp = join(dir, `.jsonl.tmp.${randomBytes(4).toString("hex")}`);

	await Bun.write(tmp, content);
	renameSync(tmp, filePath);
}

/**
 * Dedup records by ID + version — last occurrence wins.
 * For getting current state, return only highest version per ID.
 */
export function dedupById<T extends { id: string; version: number }>(records: T[]): T[] {
	const map = new Map<string, T>();
	for (const record of records) {
		const existing = map.get(record.id);
		if (!existing || record.version >= existing.version) {
			map.set(record.id, record);
		}
	}
	return Array.from(map.values());
}

/**
 * Dedup records by ID — last occurrence wins (no version required).
 * Use this for record types without version fields (e.g., schemas).
 */
export function dedupByIdLast<T extends { id: string }>(records: T[]): T[] {
	const map = new Map<string, T>();
	for (const record of records) {
		map.set(record.id, record);
	}
	return Array.from(map.values());
}

/**
 * Get all versions for a specific ID.
 */
export function getVersions<T extends { id: string; version: number }>(
	records: T[],
	id: string,
): T[] {
	const seen = new Map<number, T>();
	for (const record of records) {
		if (record.id === id) {
			seen.set(record.version, record);
		}
	}
	return Array.from(seen.values()).sort((a, b) => a.version - b.version);
}
