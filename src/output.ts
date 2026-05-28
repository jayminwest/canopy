import chalk from "chalk";

let _quiet = false;

export function setQuiet(v: boolean): void {
	_quiet = v;
}

export function isQuiet(): boolean {
	return _quiet;
}

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_SUFFIXES = ["password", "token", "secret", "apikey"] as const;
const SENSITIVE_KEY_EXACT = new Set(["npmtoken", "apikey", "secret"]);

function isSensitiveKey(key: string): boolean {
	const lower = key.toLowerCase();
	if (SENSITIVE_KEY_EXACT.has(lower)) return true;
	for (const suffix of SENSITIVE_KEY_SUFFIXES) {
		if (lower.endsWith(suffix)) return true;
	}
	return false;
}

// Matches sensitive key=value or key: value pairs embedded in free-form strings
// (e.g. error messages or environment dumps). Captures the key + separator so
// only the value run is replaced.
const SENSITIVE_STRING_PATTERN =
	/((?:npmToken|apiKey|secret|[A-Za-z0-9_.-]*(?:password|token|secret|apiKey))\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi;

function redactString(s: string): string {
	return s.replace(SENSITIVE_STRING_PATTERN, (_, prefix: string) => `${prefix}${REDACTED}`);
}

export function redact<T>(value: T): T {
	return redactInternal(value) as T;
}

function redactInternal(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (typeof value === "string") return redactString(value);
	if (typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(redactInternal);
	const out: Record<string, unknown> = {};
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = isSensitiveKey(k) ? REDACTED : redactInternal(v);
	}
	return out;
}

export function jsonOut(data: unknown): void {
	if (_quiet) {
		const isError =
			data != null &&
			typeof data === "object" &&
			"success" in data &&
			(data as Record<string, unknown>).success === false;
		if (!isError) return;
	}
	console.log(JSON.stringify(redact(data), null, 2));
}

export function humanOut(text: string): void {
	if (_quiet) return;
	console.log(text);
}

export function errorOut(msg: string): void {
	console.error(redact(msg));
}

export function isJsonMode(args: string[]): boolean {
	return args.includes("--json");
}

// Brand palette — chalk instances (supports chaining e.g. palette.brand.bold(...))
// chalk handles NO_COLOR and TTY detection automatically
export const palette = {
	brand: chalk.rgb(56, 142, 60), // Canopy deep green
	accent: chalk.rgb(255, 183, 77), // amber — IDs and accents
	muted: chalk.rgb(120, 120, 110), // stone gray — metadata
};

// Color helpers
export const c = {
	bold: (s: string) => chalk.bold(s),
	dim: (s: string) => chalk.dim(s),
	green: (s: string) => palette.brand(s),
	red: (s: string) => chalk.red(s),
	yellow: (s: string) => palette.accent(s),
	cyan: (s: string) => chalk.cyan(s),
	blue: (s: string) => chalk.blue(s),
};

// Status icons: Set D (minimal, maximum terminal compatibility)
// Use these for list status indicators, not message prefixes
export const icons = {
	pending: chalk.green("-"), // open / pending
	active: chalk.cyan(">"), // in_progress / active
	done: chalk.dim("x"), // closed / done
	blocked: chalk.yellow("!"), // blocked / warning
};

// Message format helpers per visual-spec.md
export const fmt = {
	// brand bold ✓ + brand message text
	success: (msg: string) => `${palette.brand.bold("✓")} ${palette.brand(msg)}`,
	// highlight an ID or reference in accent (amber)
	id: (id: string) => palette.accent(id),
	// yellow bold ! + yellow message + optional dim hint
	warning: (msg: string, hint?: string) =>
		hint
			? `${chalk.yellow.bold("!")} ${chalk.yellow(msg)} ${chalk.dim(hint)}`
			: `${chalk.yellow.bold("!")} ${chalk.yellow(msg)}`,
	// red bold ✗ + red message + optional dim hint
	error: (msg: string, hint?: string) =>
		hint
			? `${chalk.red.bold("✗")} ${chalk.red(msg)} ${chalk.dim(hint)}`
			: `${chalk.red.bold("✗")} ${chalk.red(msg)}`,
	// dim indented info/hint text
	info: (msg: string) => chalk.dim(`  ${msg}`),
};
