import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appendJsonl } from "../store.ts";
import type { Prompt } from "../types.ts";

// End-to-end smoke test for warren-style consumption of `cn render --json`.
// Unlike render.test.ts (which calls renderCmd directly), this spawns the
// actual cn CLI as a subprocess — the same way warren consumes canopy at
// run-spawn time — and asserts the envelope contract plus the no-shell-out
// invariant (acceptance criterion 7 of pl-003f).

const tmpDir = join(import.meta.dir, "../../.test-tmp-render-smoke");
const cnEntry = join(import.meta.dir, "../index.ts");

function makePrompt(overrides: Partial<Prompt> & { id: string; name: string }): Prompt {
	return {
		version: 1,
		sections: [],
		status: "active",
		createdAt: "2026-01-01T00:00:00Z",
		updatedAt: "2026-01-01T00:00:00Z",
		...overrides,
	};
}

async function seed(prompt: Prompt): Promise<void> {
	await appendJsonl(join(tmpDir, ".canopy", "prompts.jsonl"), prompt);
}

interface CnResult {
	stdout: string;
	stderr: string;
	exitCode: number;
}

async function runCn(args: string[], pathPrefix?: string): Promise<CnResult> {
	const env: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === "string") env[k] = v;
	}
	if (pathPrefix) {
		env.PATH = `${pathPrefix}:${env.PATH ?? ""}`;
	}
	const proc = Bun.spawn(["bun", cnEntry, ...args], {
		cwd: tmpDir,
		env,
		stdout: "pipe",
		stderr: "pipe",
	});
	const [stdout, stderr] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	]);
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

beforeEach(() => {
	mkdirSync(join(tmpDir, ".canopy"), { recursive: true });
	writeFileSync(join(tmpDir, ".canopy", "config.yaml"), "version: 1\n");
});

afterEach(() => {
	if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
});

describe("warren-style smoke: cn render --json envelope", () => {
	it("returns a stable envelope with mulch field when role declares mulch", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "warren-builder",
				sections: [{ name: "role", body: "Warren builder agent." }],
				mulch: {
					prime: { domains: ["canopy", "warren"], files: ["src/**"] },
					budget: 8000,
					on_empty: "warn",
				},
			}),
		);

		const { stdout, exitCode } = await runCn(["render", "warren-builder", "--json"]);
		expect(exitCode).toBe(0);

		const envelope = JSON.parse(stdout.trim());
		expect(envelope.success).toBe(true);
		expect(envelope.command).toBe("render");
		expect(envelope.name).toBe("warren-builder");
		expect(envelope.version).toBe(1);
		expect(envelope.sections).toEqual([{ name: "role", body: "Warren builder agent." }]);
		expect(envelope.resolvedFrom).toEqual(["warren-builder"]);
		expect(envelope.frontmatter).toEqual({});
		expect(envelope.mulch).toEqual({
			prime: { domains: ["canopy", "warren"], files: ["src/**"] },
			budget: 8000,
			on_empty: "warn",
		});

		// Warren's downstream consumption: build an `ml prime` invocation from
		// the resolved mulch declaration. This asserts the field shape is what
		// warren actually needs.
		const domains = envelope.mulch.prime.domains as string[];
		const files = envelope.mulch.prime.files as string[];
		const primeArgs = ["ml", "prime", ...domains, "--files", ...files];
		expect(primeArgs).toEqual(["ml", "prime", "canopy", "warren", "--files", "src/**"]);
	});

	it("omits mulch entirely when no role in chain declares one", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "plain-role",
				sections: [{ name: "role", body: "Plain agent." }],
			}),
		);

		const { stdout, exitCode } = await runCn(["render", "plain-role", "--json"]);
		expect(exitCode).toBe(0);

		const envelope = JSON.parse(stdout.trim());
		expect(envelope.success).toBe(true);
		expect("mulch" in envelope).toBe(false);
	});

	it("merges mulch across multi-level chain when extends_mulch=true at each layer", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "grand",
				sections: [{ name: "role", body: "Grand role." }],
				mulch: { prime: { domains: ["canopy"] }, budget: 1000, on_empty: "error" },
			}),
		);
		await seed(
			makePrompt({
				id: "p-0002",
				name: "parent",
				extends: "grand",
				extends_mulch: true,
				sections: [],
				mulch: { prime: { domains: ["warren"] }, budget: 2000 },
			}),
		);
		await seed(
			makePrompt({
				id: "p-0003",
				name: "child",
				extends: "parent",
				extends_mulch: true,
				sections: [],
				mulch: { prime: { files: ["src/**"] }, on_empty: "skip" },
			}),
		);

		const { stdout, exitCode } = await runCn(["render", "child", "--json"]);
		expect(exitCode).toBe(0);

		const envelope = JSON.parse(stdout.trim());
		expect(envelope.resolvedFrom).toEqual(["grand", "parent", "child"]);
		expect(envelope.mulch).toEqual({
			prime: { domains: ["canopy", "warren"], files: ["src/**"] },
			budget: 2000,
			on_empty: "skip",
		});
	});

	it("child wholesale overrides parent mulch when extends_mulch is unset", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "base",
				sections: [{ name: "role", body: "Base." }],
				mulch: { prime: { domains: ["a", "b"] }, budget: 1000 },
			}),
		);
		await seed(
			makePrompt({
				id: "p-0002",
				name: "child",
				extends: "base",
				sections: [],
				mulch: { prime: { domains: ["c"] } },
			}),
		);

		const { stdout, exitCode } = await runCn(["render", "child", "--json"]);
		expect(exitCode).toBe(0);

		const envelope = JSON.parse(stdout.trim());
		expect(envelope.mulch).toEqual({ prime: { domains: ["c"] } });
	});

	it("does not shell out to `ml` (PATH tracer asserts no invocation)", async () => {
		await seed(
			makePrompt({
				id: "p-0001",
				name: "warren-builder",
				sections: [{ name: "role", body: "Warren builder." }],
				mulch: { prime: { domains: ["canopy"] }, budget: 5000, on_empty: "warn" },
			}),
		);

		// Plant an `ml` shim earlier in PATH that records every invocation
		// to a marker file. If `cn render` were to shell out to mulch, the
		// marker would appear.
		const traceDir = join(tmpDir, ".trace");
		mkdirSync(traceDir, { recursive: true });
		const marker = join(traceDir, "ml-was-called");
		const tracer = join(traceDir, "ml");
		writeFileSync(tracer, `#!/bin/sh\necho "$@" >> ${JSON.stringify(marker)}\nexit 0\n`);
		Bun.spawnSync(["chmod", "+x", tracer]);

		const { stdout, exitCode } = await runCn(["render", "warren-builder", "--json"], traceDir);
		expect(exitCode).toBe(0);
		expect(existsSync(marker)).toBe(false);

		// The render still succeeds and surfaces the resolved mulch unchanged.
		const envelope = JSON.parse(stdout.trim());
		expect(envelope.mulch).toEqual({
			prime: { domains: ["canopy"] },
			budget: 5000,
			on_empty: "warn",
		});
	});
});
