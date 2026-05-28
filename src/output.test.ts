import { describe, expect, test } from "bun:test";
import { redact } from "./output.ts";

describe("redact", () => {
	test("returns primitives unchanged", () => {
		expect(redact(42)).toBe(42);
		expect(redact(true)).toBe(true);
		expect(redact(null)).toBe(null);
		expect(redact(undefined)).toBe(undefined);
	});

	test("redacts npmToken at top level", () => {
		const input = { npmToken: "npm_supersecret", project: "canopy" };
		const out = redact(input) as Record<string, unknown>;
		expect(out.npmToken).toBe("[REDACTED]");
		expect(out.project).toBe("canopy");
	});

	test("redacts apiKey and secret", () => {
		const out = redact({ apiKey: "sk-abc", secret: "shhh" }) as Record<string, unknown>;
		expect(out.apiKey).toBe("[REDACTED]");
		expect(out.secret).toBe("[REDACTED]");
	});

	test("redacts keys ending in .password or .token", () => {
		const input = {
			db: { password: "hunter2" },
			github: { token: "ghp_xxx" },
			nested: { auth: { admin_password: "abc", api_token: "def" } },
		};
		const out = redact(input) as {
			db: { password: string };
			github: { token: string };
			nested: { auth: { admin_password: string; api_token: string } };
		};
		expect(out.db.password).toBe("[REDACTED]");
		expect(out.github.token).toBe("[REDACTED]");
		expect(out.nested.auth.admin_password).toBe("[REDACTED]");
		expect(out.nested.auth.api_token).toBe("[REDACTED]");
	});

	test("recurses into arrays", () => {
		const out = redact([{ password: "x" }, { keep: "y" }]) as unknown as Array<
			Record<string, string>
		>;
		expect(out[0]?.password).toBe("[REDACTED]");
		expect(out[1]?.keep).toBe("y");
	});

	test("scrubs sensitive key=value pairs embedded in strings", () => {
		const out = redact("Failed: apiKey=sk-secret123 user=alice");
		expect(out).toContain("apiKey=[REDACTED]");
		expect(out).toContain("user=alice");
		expect(out).not.toContain("sk-secret123");
	});

	test("leaves non-sensitive strings unchanged", () => {
		const out = redact("nothing sensitive here");
		expect(out).toBe("nothing sensitive here");
	});

	test("is case-insensitive on key matching", () => {
		const out = redact({ APIKEY: "x", NPMToken: "y", SomePassword: "z" }) as Record<
			string,
			unknown
		>;
		expect(out.APIKEY).toBe("[REDACTED]");
		expect(out.NPMToken).toBe("[REDACTED]");
		expect(out.SomePassword).toBe("[REDACTED]");
	});

	test("does not redact unrelated keys that contain sensitive substrings", () => {
		const out = redact({ tokenizer: "ok", passwordless: "fine" }) as Record<string, unknown>;
		expect(out.tokenizer).toBe("ok");
		expect(out.passwordless).toBe("fine");
	});
});
