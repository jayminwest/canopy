export interface Section {
	name: string;
	body: string;
	required?: boolean;
}

export interface Prompt {
	id: string;
	name: string;
	version: number;
	sections: Section[];
	extends?: string;
	tags?: string[];
	schema?: string;
	emitAs?: string;
	pinned?: number;
	status: "draft" | "active" | "archived";
	createdAt: string;
	updatedAt: string;
}

export interface ValidationRule {
	section: string;
	pattern: string;
	message: string;
}

export interface Schema {
	id: string;
	name: string;
	requiredSections: string[];
	optionalSections?: string[];
	rules?: ValidationRule[];
	createdAt: string;
	updatedAt: string;
}

export interface Config {
	project: string;
	version: string;
	emitDir?: string;
}

export const LOCK_STALE_MS = 30000;
export const LOCK_RETRY_MS = 50;
export const LOCK_TIMEOUT_MS = 5000;
export const MAX_INHERIT_DEPTH = 5;
