import { join } from "node:path";
import type { Config } from "./types.ts";
import { parseYaml, serializeYaml } from "./yaml.ts";

export async function loadConfig(dir: string): Promise<Config> {
	const configPath = join(dir, ".canopy", "config.yaml");

	try {
		const text = await Bun.file(configPath).text();
		const parsed = parseYaml(text);

		return {
			project: parsed.project ?? "canopy",
			version: parsed.version ?? "1",
			emitDir: parsed.emitDir ?? undefined,
		};
	} catch {
		// Return defaults if config doesn't exist
		return {
			project: "canopy",
			version: "1",
		};
	}
}

export async function saveConfig(dir: string, config: Config): Promise<void> {
	const configPath = join(dir, ".canopy", "config.yaml");

	const obj: Record<string, string> = {
		project: config.project,
		version: config.version,
	};
	if (config.emitDir) {
		obj.emitDir = config.emitDir;
	}

	await Bun.write(configPath, serializeYaml(obj));
}
