const useColor = !process.env.NO_COLOR && process.stdout.isTTY;

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

// ANSI color helpers
export const c = {
	bold: (s: string) => (useColor ? `\x1b[1m${s}\x1b[0m` : s),
	dim: (s: string) => (useColor ? `\x1b[2m${s}\x1b[0m` : s),
	green: (s: string) => (useColor ? `\x1b[32m${s}\x1b[0m` : s),
	red: (s: string) => (useColor ? `\x1b[31m${s}\x1b[0m` : s),
	yellow: (s: string) => (useColor ? `\x1b[33m${s}\x1b[0m` : s),
	cyan: (s: string) => (useColor ? `\x1b[36m${s}\x1b[0m` : s),
	blue: (s: string) => (useColor ? `\x1b[34m${s}\x1b[0m` : s),
};
