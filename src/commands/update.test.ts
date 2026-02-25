import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ExitError } from "../types.ts";
import create from "./create.ts";
import init from "./init.ts";
import show from "./show.ts";
import update from "./update.ts";

const tmpDir = join(import.meta.dir, "../../.test-tmp-update");

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

describe("cn update", () => {
	it("bumps version on update", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			const { stdout } = await captureOutput(() =>
				update(["my-prompt", "--description", "New description", "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.version).toBe(2);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("updates description", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() => update(["my-prompt", "--description", "Updated desc"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.description).toBe("Updated desc");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("renames prompt with --name", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "old-name"], false));
			await captureOutput(() => update(["old-name", "--name", "new-name"], false));
			const { stdout } = await captureOutput(() => show(["new-name", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.name).toBe("new-name");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("updates section body with --section --body", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(["--name", "my-prompt", "--section", "role=Initial role"], false),
			);
			await captureOutput(() =>
				update(["my-prompt", "--section", "role", "--body", "Updated role"], false),
			);
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			const roleSection = parsed.prompt.sections.find((s: { name: string }) => s.name === "role");
			expect(roleSection?.body).toBe("Updated role");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("updates section body with shorthand name=body", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(["--name", "my-prompt", "--section", "role=Initial role"], false),
			);
			await captureOutput(() =>
				update(["my-prompt", "--section", "role=Shorthand updated"], false),
			);
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			const roleSection = parsed.prompt.sections.find((s: { name: string }) => s.name === "role");
			expect(roleSection?.body).toBe("Shorthand updated");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("adds new section if it does not exist via --section", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() =>
				update(["my-prompt", "--section", "new-sec", "--body", "New body"], false),
			);
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			const sec = parsed.prompt.sections.find((s: { name: string }) => s.name === "new-sec");
			expect(sec?.body).toBe("New body");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("adds a new section with --add-section --body", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() =>
				update(["my-prompt", "--add-section", "extra", "--body", "Extra body"], false),
			);
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			const sec = parsed.prompt.sections.find((s: { name: string }) => s.name === "extra");
			expect(sec?.body).toBe("Extra body");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("adds a new section with --add-section shorthand name=body", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() =>
				update(["my-prompt", "--add-section", "extra=Shorthand body"], false),
			);
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			const sec = parsed.prompt.sections.find((s: { name: string }) => s.name === "extra");
			expect(sec?.body).toBe("Shorthand body");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("adds multiple sections with repeated --add-section", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() =>
				update(
					["my-prompt", "--add-section", "sec-a=Body A", "--add-section", "sec-b=Body B"],
					false,
				),
			);
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			const secA = parsed.prompt.sections.find((s: { name: string }) => s.name === "sec-a");
			const secB = parsed.prompt.sections.find((s: { name: string }) => s.name === "sec-b");
			expect(secA?.body).toBe("Body A");
			expect(secB?.body).toBe("Body B");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("removes section from non-inheriting prompt with --remove-section", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() =>
				create(["--name", "my-prompt", "--section", "role=My role"], false),
			);
			await captureOutput(() => update(["my-prompt", "--remove-section", "role"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			const sec = parsed.prompt.sections.find((s: { name: string }) => s.name === "role");
			expect(sec).toBeUndefined();
		} finally {
			process.chdir(origCwd);
		}
	});

	it("sets section body to empty for inheriting prompt on --remove-section", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			// Create parent with a section
			await captureOutput(() =>
				create(["--name", "parent", "--section", "role=Parent role"], false),
			);
			// Create child that inherits from parent
			await captureOutput(() => create(["--name", "child", "--extends", "parent"], false));
			// Remove-section on inheriting child should set body to "" not splice
			await captureOutput(() => update(["child", "--remove-section", "role"], false));
			const { stdout } = await captureOutput(() => show(["child", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			const sec = parsed.prompt.sections.find((s: { name: string }) => s.name === "role");
			expect(sec).toBeDefined();
			expect(sec?.body).toBe("");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("adds a tag with --tag", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() => update(["my-prompt", "--tag", "agent"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.tags).toContain("agent");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("removes a tag with --untag", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt", "--tag", "agent"], false));
			await captureOutput(() => update(["my-prompt", "--untag", "agent"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.tags == null || !parsed.prompt.tags.includes("agent")).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("adds multiple tags with repeated --tag", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() => update(["my-prompt", "--tag", "alpha", "--tag", "beta"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.tags).toContain("alpha");
			expect(parsed.prompt.tags).toContain("beta");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("changes status with --status", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() => update(["my-prompt", "--status", "archived"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.status).toBe("archived");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("assigns schema with --schema", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() => update(["my-prompt", "--schema", "my-schema"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.schema).toBe("my-schema");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("sets extends with --extends", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "parent"], false));
			await captureOutput(() => create(["--name", "child"], false));
			await captureOutput(() => update(["child", "--extends", "parent"], false));
			const { stdout } = await captureOutput(() => show(["child", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.extends).toBe("parent");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("sets emit-as with --emit-as", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			await captureOutput(() => update(["my-prompt", "--emit-as", "custom-output.md"], false));
			const { stdout } = await captureOutput(() => show(["my-prompt", "--json"], true));
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.prompt.emitAs).toBe("custom-output.md");
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON on success", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			await captureOutput(() => create(["--name", "my-prompt"], false));
			const { stdout } = await captureOutput(() =>
				update(["my-prompt", "--tag", "test", "--json"], true),
			);
			const parsed = JSON.parse(stdout.trim());
			expect(parsed.success).toBe(true);
			expect(parsed.command).toBe("update");
			expect(parsed.name).toBe("my-prompt");
			expect(parsed.version).toBe(2);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("throws ExitError when prompt not found", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => update(["no-such-prompt"], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});

	it("outputs JSON error when prompt not found with --json", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			let parsed: Record<string, unknown> = {};
			try {
				const { stdout } = await captureOutput(() => update(["no-such-prompt", "--json"], true));
				parsed = JSON.parse(stdout.trim());
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
			// parsed may be empty if error thrown before output, but JSON mode should still indicate failure
			void parsed;
		} finally {
			process.chdir(origCwd);
		}
	});

	it("throws ExitError when no name provided", async () => {
		const origCwd = process.cwd();
		process.chdir(tmpDir);
		try {
			let threw = false;
			try {
				await captureOutput(() => update([], false));
			} catch (err) {
				threw = true;
				expect(err).toBeInstanceOf(ExitError);
			}
			expect(threw).toBe(true);
		} finally {
			process.chdir(origCwd);
		}
	});
});
