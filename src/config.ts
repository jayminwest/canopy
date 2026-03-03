import { join } from "node:path";
import type { Config, EmitTarget } from "./types.ts";
import { parseYaml, serializeYaml, type YamlMap } from "./yaml.ts";

export async function loadConfig(dir: string): Promise<Config> {
	const configPath = join(dir, ".canopy", "config.yaml");

	try {
		const text = await Bun.file(configPath).text();
		const parsed = parseYaml(text);

		const project = typeof parsed.project === "string" ? parsed.project : "canopy";
		const version = typeof parsed.version === "string" ? parsed.version : "1";

		const config: Config = { project, version };

		// New format: targets
		if (typeof parsed.targets === "object" && !Array.isArray(parsed.targets)) {
			config.targets = {};
			for (const [name, targetValue] of Object.entries(parsed.targets as Record<string, unknown>)) {
				if (
					typeof targetValue === "object" &&
					targetValue !== null &&
					!Array.isArray(targetValue)
				) {
					const tv = targetValue as Record<string, unknown>;
					const target: EmitTarget = { dir: typeof tv.dir === "string" ? tv.dir : name };
					if (tv.default === "true" || tv.default === true) target.default = true;
					if (Array.isArray(tv.tags)) {
						target.tags = tv.tags.filter((t): t is string => typeof t === "string");
					}
					config.targets[name] = target;
				}
			}
		}
		// Legacy format: emitDir / emitDirByTag → convert to targets
		else {
			const emitDir = typeof parsed.emitDir === "string" ? parsed.emitDir || undefined : undefined;
			const rawByTag = parsed.emitDirByTag;

			if (
				emitDir ||
				(typeof rawByTag === "object" && rawByTag !== null && !Array.isArray(rawByTag))
			) {
				config.targets = {};
				const defaultDir = emitDir || "agents";
				config.targets.default = { dir: defaultDir, default: true };

				if (typeof rawByTag === "object" && rawByTag !== null && !Array.isArray(rawByTag)) {
					// Invert tag→dir map to dir→tags, creating named targets
					const dirToTags: Record<string, string[]> = {};
					for (const [tag, tdir] of Object.entries(rawByTag as Record<string, string>)) {
						const existing = dirToTags[tdir];
						if (existing) {
							existing.push(tag);
						} else {
							dirToTags[tdir] = [tag];
						}
					}
					for (const [tdir, tags] of Object.entries(dirToTags)) {
						if (tdir === defaultDir) {
							// Merge tags into the default target
							config.targets.default.tags = tags;
						} else {
							// Generate a name from the directory path
							const name =
								tdir
									.replace(/[^a-zA-Z0-9]/g, "-")
									.replace(/^-+|-+$/g, "")
									.replace(/-+/g, "-") || "target";
							config.targets[name] = { dir: tdir, tags };
						}
					}
				}
			}
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

	const obj: YamlMap = {
		project: config.project,
		version: config.version,
	};

	if (config.targets && Object.keys(config.targets).length > 0) {
		const targetsMap: YamlMap = {};
		for (const [name, target] of Object.entries(config.targets)) {
			const targetMap: YamlMap = { dir: target.dir };
			if (target.default) targetMap.default = "true";
			if (target.tags && target.tags.length > 0) targetMap.tags = target.tags;
			targetsMap[name] = targetMap;
		}
		obj.targets = targetsMap;
	}

	await Bun.write(configPath, serializeYaml(obj));
}
