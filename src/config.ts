import { join } from "node:path";
import type { Config } from "./types.ts";
import { parseYaml, serializeYaml } from "./yaml.ts";

export async function loadConfig(dir: string): Promise<Config> {
	const configPath = join(dir, ".canopy", "config.yaml");

	try {
		const text = await Bun.file(configPath).text();
		const parsed = parseYaml(text);

		const project = typeof parsed.project === "string" ? parsed.project : "canopy";
		const version = typeof parsed.version === "string" ? parsed.version : "1";
		const emitDir = typeof parsed.emitDir === "string" ? parsed.emitDir || undefined : undefined;

		const config: Config = { project, version, emitDir };

		const rawByTag = parsed.emitDirByTag;
		if (typeof rawByTag === "object" && rawByTag !== null) {
			config.emitDirByTag = rawByTag as Record<string, string>;
		}

		return config;
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

	const obj: Record<string, string | Record<string, string>> = {
		project: config.project,
		version: config.version,
	};
	if (config.emitDir) {
		obj.emitDir = config.emitDir;
	}
	if (config.emitDirByTag && Object.keys(config.emitDirByTag).length > 0) {
		obj.emitDirByTag = config.emitDirByTag;
	}

	await Bun.write(configPath, serializeYaml(obj));
}
