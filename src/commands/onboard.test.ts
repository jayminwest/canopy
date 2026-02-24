import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import onboard from "./onboard.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-onboard");

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

beforeEach(() => {
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	if (existsSync(tmpDir)) {
		rmSync(tmpDir, { recursive: true });
	}
});

describe("cn onboard", () => {
	it("creates CLAUDE.md when no target file exists", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => onboard([], false));
			const content = await Bun.file(join(tmpDir, "CLAUDE.md")).text();
			expect(content).toContain("<!-- canopy:start -->");
			expect(content).toContain("<!-- canopy:end -->");
			expect(content).toContain("Prompt Management (Canopy)");
			expect(content).toContain("cn prime");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("appends to existing CLAUDE.md", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await Bun.write(join(tmpDir, "CLAUDE.md"), "# My Project\n\nExisting content.\n");
			await captureOutput(() => onboard([], false));
			const content = await Bun.file(join(tmpDir, "CLAUDE.md")).text();
			expect(content).toContain("# My Project");
			expect(content).toContain("Existing content.");
			expect(content).toContain("<!-- canopy:start -->");
			expect(content).toContain("Prompt Management (Canopy)");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("is idempotent — second onboard does not duplicate", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => onboard([], false));
			const first = await Bun.file(join(tmpDir, "CLAUDE.md")).text();
			await captureOutput(() => onboard([], false));
			const second = await Bun.file(join(tmpDir, "CLAUDE.md")).text();
			expect(second).toBe(first);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--check reports missing when no file exists", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => onboard(["--check"], false));
			expect(stdout).toContain("missing");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--check reports current after onboard", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => onboard([], false));
			const { stdout } = await captureOutput(() => onboard(["--check"], false));
			expect(stdout).toContain("current");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--check with --json returns structured output", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => onboard([], false));
			const { stdout } = await captureOutput(() => onboard(["--check"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.status).toBe("current");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--stdout prints snippet without writing", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => onboard(["--stdout"], false));
			expect(stdout).toContain("<!-- canopy:start -->");
			expect(stdout).toContain("Prompt Management (Canopy)");
			// Should not have created the file
			expect(existsSync(join(tmpDir, "CLAUDE.md"))).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("detects existing CLAUDE.md in .claude/ subdirectory", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const claudeDir = join(tmpDir, ".claude");
			mkdirSync(claudeDir, { recursive: true });
			await Bun.write(join(claudeDir, "CLAUDE.md"), "# Agent Instructions\n");
			await captureOutput(() => onboard([], false));
			const content = await Bun.file(join(claudeDir, "CLAUDE.md")).text();
			expect(content).toContain("<!-- canopy:start -->");
			// Root CLAUDE.md should NOT have been created
			expect(existsSync(join(tmpDir, "CLAUDE.md"))).toBe(false);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("updates outdated section when version changes", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const oldContent =
				"# Project\n\n<!-- canopy:start -->\n## Old Canopy Section\n<!-- canopy-onboard-v:0 -->\nold content\n<!-- canopy:end -->\n";
			await Bun.write(join(tmpDir, "CLAUDE.md"), oldContent);
			await captureOutput(() => onboard([], false));
			const content = await Bun.file(join(tmpDir, "CLAUDE.md")).text();
			expect(content).toContain("# Project");
			expect(content).toContain("canopy-onboard-v:1");
			expect(content).not.toContain("canopy-onboard-v:0");
			expect(content).not.toContain("Old Canopy Section");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("--json output on create", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => onboard([], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.action).toBe("created");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("includes version marker in output", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => onboard([], false));
			const content = await Bun.file(join(tmpDir, "CLAUDE.md")).text();
			expect(content).toContain("canopy-onboard-v:1");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("shows help with --help", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			const { stdout } = await captureOutput(() => onboard(["--help"], false));
			expect(stdout).toContain("Usage: cn onboard");
		} finally {
			process.chdir(origCwd);
		}
	});
});
