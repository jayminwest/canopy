import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import init from "./init.ts";
import prime from "./prime.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-prime");

function captureOutput(fn: () => Promise<void>): Promise<{ stdout: string; stderr: string }> {
	const origLog = console.log;
	const origError = console.error;
	const origWrite = process.stdout.write;
	let stdout = "";
	let stderr = "";

	console.log = (...args: unknown[]) => {
		stdout += `${args.join(" ")}\n`;
	};
	console.error = (...args: unknown[]) => {
		stderr += `${args.join(" ")}\n`;
	};
	process.stdout.write = ((chunk: string) => {
		stdout += chunk;
		return true;
	}) as typeof process.stdout.write;

	return fn()
		.then(() => {
			console.log = origLog;
			console.error = origError;
			process.stdout.write = origWrite;
			return { stdout, stderr };
		})
		.catch((err) => {
			console.log = origLog;
			console.error = origError;
			process.stdout.write = origWrite;
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
	if (existsSync(tmpDir)) {
		rmSync(tmpDir, { recursive: true });
	}
});

describe("cn prime", () => {
	it("outputs full prime content by default", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => prime([], false));
			expect(stdout).toContain("Canopy Workflow Context");
			expect(stdout).toContain("Essential Commands");
			expect(stdout).toContain("cn list");
			expect(stdout).toContain("cn render");
			expect(stdout).toContain("cn emit");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs compact content with --compact", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => prime(["--compact"], false));
			expect(stdout).toContain("Canopy Quick Reference");
			expect(stdout).not.toContain("Common Workflows");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON with --json", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => prime([], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("prime");
			expect(parsed.content).toContain("Canopy Workflow Context");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--export outputs default template even with custom PRIME.md", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await Bun.write(join(tmpDir, ".canopy", "PRIME.md"), "custom prime content");
			const { stdout } = await captureOutput(() => prime(["--export"], false));
			expect(stdout).toContain("Canopy Workflow Context");
			expect(stdout).not.toContain("custom prime content");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("uses custom PRIME.md when present", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await Bun.write(join(tmpDir, ".canopy", "PRIME.md"), "my custom agent context");
			const { stdout } = await captureOutput(() => prime([], false));
			expect(stdout).toBe("my custom agent context");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("full content includes all major sections", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => prime([], false));
			expect(stdout).toContain("Viewing Prompts");
			expect(stdout).toContain("Creating & Updating");
			expect(stdout).toContain("Emitting");
			expect(stdout).toContain("Schemas & Validation");
			expect(stdout).toContain("Common Workflows");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--export with --json returns JSON", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => prime(["--export"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.content).toContain("Canopy Workflow Context");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("works without .canopy/ initialized", async () => {
		const noInitDir = join(tmpDir, "no-init");
		mkdirSync(noInitDir, { recursive: true });
		const origCwd = process.cwd();
		process.chdir(noInitDir);
		try {
			const { stdout } = await captureOutput(() => prime([], false));
			expect(stdout).toContain("Canopy Workflow Context");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows help with --help", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => prime(["--help"], false));
			expect(stdout).toContain("Usage: cn prime");
		} finally {
			process.chdir(origCwd);
		}
	});
});
