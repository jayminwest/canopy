import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { dedupById, readJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";
import { ExitError } from "../types.ts";
import create from "./create.ts";
import init from "./init.ts";
import pin, { defaultUnpin } from "./pin.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-pin");

function captureOutput(fn: () => Promise<void>): Promise<{ stdout: string; stderr: string }> {
	const origLog = console.log;
	const origError = console.error;
	let stdout = "";
	let stderr = "";
	console.log = (...args: unknown[]) => {
		stdout += `${args.join(" ")}\n`;
	};
	console.error = (...args: unknown[]) => {
		stderr += `${args.join(" ")}\n`;
	};
	return fn()
		.then(() => {
			console.log = origLog;
			console.error = origError;
			return { stdout, stderr };
		})
		.catch((err) => {
			console.log = origLog;
			console.error = origError;
			throw err;
		});
}

beforeEach(async () => {
	mkdirSync(tmpDir, { recursive: true });
	const origCwd = process.cwd();
	process.chdir(tmpDir);
	await captureOutput(() => init([], false));
	process.chdir(origCwd);
});

afterEach(() => {
	if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe("cn pin", () => {
	it("pins a prompt to a specific version", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			// Create prompt (version 1), then create version 2 via a store append
			await captureOutput(() => create(["--name", "my-prompt"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const p = current.find((x) => x.name === "my-prompt");
			if (!p) throw new Error("Prompt not found after create");

			// Append a v2 so we have a pinnable history
			const { appendJsonl } = await import("../store.ts");
			const v2: Prompt = {
				...p,
				version: 2,
				updatedAt: new Date().toISOString(),
			};
			await appendJsonl(promptsPath, v2);

			const { stdout } = await captureOutput(() => pin(["my-prompt@1"], false));
			expect(stdout).toContain("my-prompt");
			expect(stdout).toContain("1");

			// Verify pinned field persists in JSONL
			const allRecords = await readJsonl<Prompt>(promptsPath);
			const updated = dedupById(allRecords);
			const pinned = updated.find((x) => x.name === "my-prompt");
			expect(pinned?.pinned).toBe(1);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON on successful pin", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "json-prompt"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const p = current.find((x) => x.name === "json-prompt");
			if (!p) throw new Error("Prompt not found");

			const { appendJsonl } = await import("../store.ts");
			await appendJsonl(promptsPath, { ...p, version: 2, updatedAt: new Date().toISOString() });

			const { stdout } = await captureOutput(() => pin(["json-prompt@1", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("pin");
			expect(parsed.name).toBe("json-prompt");
			expect(parsed.pinned).toBe(1);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when prompt does not exist", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => pin(["nonexistent@1"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when target version does not exist", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "versioned-prompt"], false));

			let threw = false;
			try {
				// Version 99 does not exist
				await captureOutput(() => pin(["versioned-prompt@99"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when no argument provided", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => pin([], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when argument has no @ separator", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => pin(["my-prompt-no-at"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON error when prompt not found (--json)", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			let capturedStdout = "";
			const origLog = console.log;
			console.log = (...args: unknown[]) => {
				capturedStdout += `${args.join(" ")}\n`;
			};
			try {
				await pin(["ghost@1", "--json"], true);
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			} finally {
				console.log = origLog;
			}
			expect(threw).toBe(true);
			const parsed = JSON.parse(capturedStdout.trim());
			expect(parsed.success).toBe(false);
			expect(parsed.error).toContain("ghost");
		} finally {
			process.chdir(origCwd);
		}
	});
});

describe("cn unpin", () => {
	it("unpins a pinned prompt", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "pinned-prompt"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const p = current.find((x) => x.name === "pinned-prompt");
			if (!p) throw new Error("Prompt not found");

			// Append v2 and pin to v1
			const { appendJsonl } = await import("../store.ts");
			await appendJsonl(promptsPath, { ...p, version: 2, updatedAt: new Date().toISOString() });
			await captureOutput(() => pin(["pinned-prompt@1"], false));

			// Now unpin
			const { stdout } = await captureOutput(() => defaultUnpin(["pinned-prompt"], false));
			expect(stdout).toContain("pinned-prompt");

			// Verify pinned field is gone
			const allRecords = await readJsonl<Prompt>(promptsPath);
			const updated = dedupById(allRecords);
			const unpinned = updated.find((x) => x.name === "pinned-prompt");
			expect(unpinned?.pinned).toBeUndefined();
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON on successful unpin", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "up-prompt"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const p = current.find((x) => x.name === "up-prompt");
			if (!p) throw new Error("Prompt not found");
			const { appendJsonl } = await import("../store.ts");
			await appendJsonl(promptsPath, { ...p, version: 2, updatedAt: new Date().toISOString() });
			await captureOutput(() => pin(["up-prompt@1"], false));

			const { stdout } = await captureOutput(() => defaultUnpin(["up-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("unpin");
			expect(parsed.name).toBe("up-prompt");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when prompt does not exist", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => defaultUnpin(["no-such-prompt"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("errors when no argument provided", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => defaultUnpin([], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("pinned state persists across multiple JSONL records", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "persist-prompt"], false));

			const promptsPath = join(tmpDir, ".canopy", "prompts.jsonl");
			const records = await readJsonl<Prompt>(promptsPath);
			const current = dedupById(records);
			const p = current.find((x) => x.name === "persist-prompt");
			if (!p) throw new Error("Prompt not found");

			const { appendJsonl } = await import("../store.ts");
			// Create versions 2 and 3
			await appendJsonl(promptsPath, { ...p, version: 2, updatedAt: new Date().toISOString() });
			await appendJsonl(promptsPath, { ...p, version: 3, updatedAt: new Date().toISOString() });

			// Pin to version 2
			await captureOutput(() => pin(["persist-prompt@2"], false));

			// Read back: pinned should be 2 on the latest record
			const allRecords = await readJsonl<Prompt>(promptsPath);
			const latest = dedupById(allRecords);
			const result = latest.find((x) => x.name === "persist-prompt");
			expect(result?.pinned).toBe(2);
		} finally {
			process.chdir(origCwd);
		}
	});
});
