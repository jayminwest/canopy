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

// Brand palette (chalk handles NO_COLOR and TTY detection automatically)
export const palette = {
	brand: (s: string) => chalk.rgb(56, 142, 60)(s), // Canopy deep green
	accent: (s: string) => chalk.rgb(255, 183, 77)(s), // amber — IDs and accents
	muted: (s: string) => chalk.rgb(120, 120, 110)(s), // stone gray — metadata
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
