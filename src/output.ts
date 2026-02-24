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

// Color helpers (chalk handles NO_COLOR and TTY detection automatically)
export const c = {
	bold: (s: string) => chalk.bold(s),
	dim: (s: string) => chalk.dim(s),
	green: (s: string) => chalk.green(s),
	red: (s: string) => chalk.red(s),
	yellow: (s: string) => chalk.yellow(s),
	cyan: (s: string) => chalk.cyan(s),
	blue: (s: string) => chalk.blue(s),
};
