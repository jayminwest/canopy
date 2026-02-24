import chalk from "chalk";

export function jsonOut(data: unknown): void {
	console.log(JSON.stringify(data, null, 2));
}

export function humanOut(text: string): void {
	console.log(text);
}

export function errorOut(msg: string): void {
	console.error(msg);
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
