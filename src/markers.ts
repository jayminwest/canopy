export const START_MARKER = "<!-- canopy:start -->";
export const END_MARKER = "<!-- canopy:end -->";

export const ONBOARD_VERSION = 1;
export const VERSION_MARKER = `<!-- canopy-onboard-v:${String(ONBOARD_VERSION)} -->`;

export function hasMarkerSection(content: string): boolean {
	return content.includes(START_MARKER) && content.includes(END_MARKER);
}

export function detectStatus(content: string): "missing" | "current" | "outdated" {
	if (!hasMarkerSection(content)) return "missing";
	if (content.includes(VERSION_MARKER)) return "current";
	return "outdated";
}

export function replaceMarkerSection(content: string, newSection: string): string | null {
	const startIdx = content.indexOf(START_MARKER);
	const endIdx = content.indexOf(END_MARKER);
	if (startIdx === -1 || endIdx === -1) return null;
	const before = content.slice(0, startIdx);
	const after = content.slice(endIdx + END_MARKER.length);
	return before + wrapInMarkers(newSection) + after;
}

export function wrapInMarkers(section: string): string {
	return `${START_MARKER}\n${section}\n${END_MARKER}`;
}
