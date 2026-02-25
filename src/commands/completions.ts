/**
 * Shell completion generation for canopy CLI.
 *
 * Generates completion scripts for bash, zsh, and fish shells.
 */

import { Command } from "commander";
import { errorOut, jsonOut } from "../output.ts";
import { ExitError } from "../types.ts";

interface FlagDef {
	name: string;
	desc: string;
	takesValue?: boolean;
	values?: readonly string[];
}

interface SubcommandDef {
	name: string;
	desc: string;
	flags?: readonly FlagDef[];
}

interface CommandDef {
	name: string;
	desc: string;
	flags?: readonly FlagDef[];
	subcommands?: readonly SubcommandDef[];
}

export const COMMANDS: readonly CommandDef[] = [
	{
		name: "init",
		desc: "Initialize .canopy/ in current directory",
		flags: [
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "show",
		desc: "Show prompt record",
		flags: [
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "list",
		desc: "List prompts",
		flags: [
			{ name: "--tag", desc: "Filter by tag", takesValue: true },
			{
				name: "--status",
				desc: "Filter by status",
				takesValue: true,
				values: ["draft", "active", "archived"],
			},
			{ name: "--extends", desc: "Filter by parent prompt", takesValue: true },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "archive",
		desc: "Archive a prompt",
		flags: [
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "history",
		desc: "Show version timeline for a prompt",
		flags: [
			{ name: "--limit", desc: "Max versions to show", takesValue: true },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "tree",
		desc: "Show inheritance tree for a prompt",
		flags: [
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "stats",
		desc: "Show prompt statistics",
		flags: [
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "sync",
		desc: "Stage and commit .canopy/ changes",
		flags: [
			{ name: "--status", desc: "Check sync status without committing" },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "diff",
		desc: "Section-aware diff between prompt versions",
		flags: [
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "render",
		desc: "Render full prompt (resolve inheritance)",
		flags: [
			{
				name: "--format",
				desc: "Output format",
				takesValue: true,
				values: ["md", "json"],
			},
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "create",
		desc: "Create a new prompt",
		flags: [
			{ name: "--name", desc: "Prompt name", takesValue: true },
			{ name: "--description", desc: "Short description", takesValue: true },
			{ name: "--extends", desc: "Inherit from parent prompt", takesValue: true },
			{ name: "--tag", desc: "Add tag", takesValue: true },
			{ name: "--schema", desc: "Assign validation schema", takesValue: true },
			{ name: "--emit-as", desc: "Custom emit filename", takesValue: true },
			{ name: "--emit-dir", desc: "Custom emit directory", takesValue: true },
			{
				name: "--status",
				desc: "Initial status",
				takesValue: true,
				values: ["draft", "active"],
			},
			{ name: "--section", desc: "Add section (name=body)", takesValue: true },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "update",
		desc: "Update a prompt (creates new version)",
		flags: [
			{ name: "--name", desc: "Rename prompt", takesValue: true },
			{ name: "--description", desc: "Update description", takesValue: true },
			{ name: "--section", desc: "Section to update", takesValue: true },
			{ name: "--body", desc: "New body for section", takesValue: true },
			{ name: "--add-section", desc: "Add a new section (name=body)", takesValue: true },
			{ name: "--remove-section", desc: "Remove a section", takesValue: true },
			{ name: "--tag", desc: "Add tag", takesValue: true },
			{ name: "--untag", desc: "Remove tag", takesValue: true },
			{ name: "--schema", desc: "Assign schema", takesValue: true },
			{ name: "--extends", desc: "Change parent prompt", takesValue: true },
			{ name: "--emit-as", desc: "Custom emit filename", takesValue: true },
			{ name: "--emit-dir", desc: "Custom emit directory", takesValue: true },
			{
				name: "--status",
				desc: "Change status",
				takesValue: true,
				values: ["draft", "active", "archived"],
			},
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "emit",
		desc: "Render and write prompt to a file",
		flags: [
			{ name: "--all", desc: "Emit all active prompts" },
			{ name: "--check", desc: "Check if emitted files are up to date" },
			{ name: "--out", desc: "Custom output path", takesValue: true },
			{ name: "--out-dir", desc: "Custom output directory", takesValue: true },
			{ name: "--force", desc: "Overwrite even if unchanged" },
			{ name: "--dry-run", desc: "Show what would be emitted" },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "schema",
		desc: "Schema management",
		flags: [{ name: "--help", desc: "Show help" }],
		subcommands: [
			{
				name: "create",
				desc: "Create a validation schema",
				flags: [
					{ name: "--name", desc: "Schema name", takesValue: true },
					{ name: "--required", desc: "Required sections (comma-separated)", takesValue: true },
					{ name: "--optional", desc: "Optional sections (comma-separated)", takesValue: true },
					{ name: "--json", desc: "JSON output" },
				],
			},
			{
				name: "show",
				desc: "Show schema details",
				flags: [{ name: "--json", desc: "JSON output" }],
			},
			{
				name: "list",
				desc: "List all schemas",
				flags: [{ name: "--json", desc: "JSON output" }],
			},
			{
				name: "rule",
				desc: "Manage schema rules",
				flags: [
					{ name: "--section", desc: "Section to validate", takesValue: true },
					{ name: "--pattern", desc: "Regex pattern", takesValue: true },
					{ name: "--message", desc: "Error message", takesValue: true },
					{ name: "--json", desc: "JSON output" },
				],
			},
		],
	},
	{
		name: "validate",
		desc: "Validate a prompt against its schema",
		flags: [
			{ name: "--all", desc: "Validate all prompts with schemas" },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "import",
		desc: "Import an existing .md file as a prompt",
		flags: [
			{ name: "--name", desc: "Prompt name", takesValue: true },
			{ name: "--no-split", desc: "Import as single body section" },
			{ name: "--tag", desc: "Add tag", takesValue: true },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "prime",
		desc: "Output workflow context for AI agents",
		flags: [
			{ name: "--compact", desc: "Output minimal quick-reference" },
			{ name: "--export", desc: "Output default template" },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "onboard",
		desc: "Add canopy section to CLAUDE.md",
		flags: [
			{ name: "--check", desc: "Report status without writing" },
			{ name: "--stdout", desc: "Print snippet to stdout" },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "pin",
		desc: "Pin prompt to a specific version",
		flags: [
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "unpin",
		desc: "Remove version pin from a prompt",
		flags: [
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "doctor",
		desc: "Check project health and data integrity",
		flags: [
			{ name: "--fix", desc: "Fix auto-fixable issues" },
			{ name: "--verbose", desc: "Show all check results" },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "upgrade",
		desc: "Upgrade canopy to the latest version",
		flags: [
			{ name: "--check", desc: "Check for updates without installing" },
			{ name: "--json", desc: "JSON output" },
			{ name: "--help", desc: "Show help" },
		],
	},
	{
		name: "completions",
		desc: "Generate shell completions",
		flags: [{ name: "--help", desc: "Show help" }],
	},
] as const;

const BIN = "cn";

export function generateBash(): string {
	const lines: string[] = [
		`# Bash completion for ${BIN}`,
		`# Source this file to enable completions:`,
		`#   source <(${BIN} completions bash)`,
		"",
		`_${BIN}() {`,
		"  local cur prev words cword",
		"  _init_completion || return",
		"",
		`  local commands='${COMMANDS.map((c) => c.name).join(" ")}'`,
		"",
		"  # Top-level completion",
		"  if [[ $cword -eq 1 ]]; then",
		'    COMPREPLY=($(compgen -W "$commands --help --version --timing" -- "$cur"))',
		"    return",
		"  fi",
		"",
		`  local command="\${words[1]}"`,
		"",
	];

	for (const cmd of COMMANDS) {
		lines.push(`  if [[ $command == "${cmd.name}" ]]; then`);

		if (cmd.subcommands && cmd.subcommands.length > 0) {
			const subcmdNames = cmd.subcommands.map((s) => s.name).join(" ");
			lines.push("    if [[ $cword -eq 2 ]]; then");
			lines.push(`      COMPREPLY=($(compgen -W "${subcmdNames}" -- "$cur"))`);
			lines.push("      return");
			lines.push("    fi");

			for (const subcmd of cmd.subcommands) {
				if (subcmd.flags && subcmd.flags.length > 0) {
					const subcmdFlags = subcmd.flags.map((f) => f.name).join(" ");
					lines.push(`    if [[ \${words[2]} == "${subcmd.name}" ]]; then`);
					lines.push(`      COMPREPLY=($(compgen -W "${subcmdFlags}" -- "$cur"))`);
					lines.push("      return");
					lines.push("    fi");
				}
			}
		}

		if (cmd.flags && cmd.flags.length > 0) {
			const cmdFlags = cmd.flags.map((f) => f.name).join(" ");
			lines.push(`    COMPREPLY=($(compgen -W "${cmdFlags}" -- "$cur"))`);
			lines.push("    return");
		}

		lines.push("  fi");
		lines.push("");
	}

	lines.push("  return 0");
	lines.push("}");
	lines.push("");
	lines.push(`complete -F _${BIN} ${BIN}`);

	return lines.join("\n");
}

export function generateZsh(): string {
	const lines: string[] = [
		`#compdef ${BIN}`,
		`# Zsh completion for ${BIN}`,
		`# Place this file in your fpath or source it:`,
		`#   source <(${BIN} completions zsh)`,
		"",
		`_${BIN}() {`,
		"  local -a commands",
		"  commands=(",
	];

	for (const cmd of COMMANDS) {
		lines.push(`    '${cmd.name}:${cmd.desc}'`);
	}
	lines.push("  )");
	lines.push("");

	lines.push("  local -a global_opts");
	lines.push("  global_opts=(");
	lines.push("    '--help[Show help]'");
	lines.push("    '--version[Show version]'");
	lines.push("    '--json[Output as JSON]'");
	lines.push("    '--quiet[Suppress non-error output]'");
	lines.push("    '--verbose[Extra diagnostic output]'");
	lines.push("    '--timing[Show command execution time]'");
	lines.push("  )");
	lines.push("");

	lines.push("  if (( CURRENT == 2 )); then");
	lines.push("    _describe 'command' commands");
	lines.push("    _arguments $global_opts");
	lines.push("    return");
	lines.push("  fi");
	lines.push("");

	lines.push('  local command="$words[2]"');
	lines.push("");
	lines.push('  case "$command" in');

	for (const cmd of COMMANDS) {
		lines.push(`    ${cmd.name})`);

		if (cmd.subcommands && cmd.subcommands.length > 0) {
			lines.push("      local -a subcommands");
			lines.push("      subcommands=(");
			for (const subcmd of cmd.subcommands) {
				lines.push(`        '${subcmd.name}:${subcmd.desc}'`);
			}
			lines.push("      )");
			lines.push("");
			lines.push("      if (( CURRENT == 3 )); then");
			lines.push("        _describe 'subcommand' subcommands");
			lines.push("        return");
			lines.push("      fi");

			for (const subcmd of cmd.subcommands) {
				if (subcmd.flags && subcmd.flags.length > 0) {
					lines.push(`      if [[ $words[3] == "${subcmd.name}" ]]; then`);
					lines.push("        _arguments \\");
					for (const flag of subcmd.flags) {
						if (flag.values) {
							const vals = flag.values.join(" ");
							lines.push(`          '${flag.name}[${flag.desc}]:value:(${vals})' \\`);
						} else if (flag.takesValue) {
							lines.push(`          '${flag.name}[${flag.desc}]:value:' \\`);
						} else {
							lines.push(`          '${flag.name}[${flag.desc}]' \\`);
						}
					}
					const lastLine = lines[lines.length - 1];
					if (lastLine) {
						lines[lines.length - 1] = lastLine.replace(" \\", "");
					}
					lines.push("        return");
					lines.push("      fi");
				}
			}
		}

		if (cmd.flags && cmd.flags.length > 0) {
			lines.push("      _arguments \\");
			for (const flag of cmd.flags) {
				if (flag.values) {
					const vals = flag.values.join(" ");
					lines.push(`        '${flag.name}[${flag.desc}]:value:(${vals})' \\`);
				} else if (flag.takesValue) {
					lines.push(`        '${flag.name}[${flag.desc}]:value:' \\`);
				} else {
					lines.push(`        '${flag.name}[${flag.desc}]' \\`);
				}
			}
			const lastLine = lines[lines.length - 1];
			if (lastLine) {
				lines[lines.length - 1] = lastLine.replace(" \\", "");
			}
		}

		lines.push("      ;;");
	}

	lines.push("  esac");
	lines.push("}");
	lines.push("");
	lines.push(`_${BIN} "$@"`);

	return lines.join("\n");
}

export function generateFish(): string {
	const lines: string[] = [
		`# Fish completion for ${BIN}`,
		`# Place this file in ~/.config/fish/completions/${BIN}.fish or source it:`,
		`#   ${BIN} completions fish | source`,
		"",
		`# Remove all existing completions for ${BIN}`,
		`complete -c ${BIN} -e`,
		"",
		"# Global options",
		`complete -c ${BIN} -l help -d 'Show help'`,
		`complete -c ${BIN} -l version -d 'Show version'`,
		`complete -c ${BIN} -l json -d 'Output as JSON'`,
		`complete -c ${BIN} -l quiet -d 'Suppress non-error output'`,
		`complete -c ${BIN} -l verbose -d 'Extra diagnostic output'`,
		`complete -c ${BIN} -l timing -d 'Show command execution time'`,
		"",
	];

	for (const cmd of COMMANDS) {
		lines.push(`# ${cmd.desc}`);
		lines.push(
			`complete -c ${BIN} -f -n '__fish_use_subcommand' -a '${cmd.name}' -d '${cmd.desc}'`,
		);

		if (cmd.subcommands && cmd.subcommands.length > 0) {
			for (const subcmd of cmd.subcommands) {
				lines.push(
					`complete -c ${BIN} -f -n '__fish_seen_subcommand_from ${cmd.name}; and not __fish_seen_subcommand_from ${cmd.subcommands.map((s) => s.name).join(" ")}' -a '${subcmd.name}' -d '${subcmd.desc}'`,
				);

				if (subcmd.flags && subcmd.flags.length > 0) {
					for (const flag of subcmd.flags) {
						const flagName = flag.name.replace(/^--/, "");
						const cond = `'__fish_seen_subcommand_from ${cmd.name}; and __fish_seen_subcommand_from ${subcmd.name}'`;

						if (flag.values) {
							lines.push(
								`complete -c ${BIN} -f -n ${cond} -l '${flagName}' -d '${flag.desc}' -xa '${flag.values.join(" ")}'`,
							);
						} else if (flag.takesValue) {
							lines.push(`complete -c ${BIN} -n ${cond} -l '${flagName}' -d '${flag.desc}'`);
						} else {
							lines.push(`complete -c ${BIN} -f -n ${cond} -l '${flagName}' -d '${flag.desc}'`);
						}
					}
				}
			}
		}

		if (cmd.flags && cmd.flags.length > 0) {
			for (const flag of cmd.flags) {
				const flagName = flag.name.replace(/^--/, "");
				const cond = `'__fish_seen_subcommand_from ${cmd.name}'`;

				if (flag.values) {
					lines.push(
						`complete -c ${BIN} -f -n ${cond} -l '${flagName}' -d '${flag.desc}' -xa '${flag.values.join(" ")}'`,
					);
				} else if (flag.takesValue) {
					lines.push(`complete -c ${BIN} -n ${cond} -l '${flagName}' -d '${flag.desc}'`);
				} else {
					lines.push(`complete -c ${BIN} -f -n ${cond} -l '${flagName}' -d '${flag.desc}'`);
				}
			}
		}

		lines.push("");
	}

	return lines.join("\n");
}

/**
 * Create the Commander command for `cn completions`.
 */
export function createCompletionsCommand(): Command {
	return new Command("completions")
		.description("Generate shell completions")
		.argument("<shell>", "Shell to generate completions for (bash, zsh, fish)")
		.option("--json", "Output as JSON")
		.action((shell: string, opts: { json?: boolean }) => {
			completionsCommand([shell], opts.json ?? false);
		});
}

export function completionsCommand(args: string[], json = false): void {
	const shell = args[0];

	if (!shell) {
		if (json) {
			jsonOut({ success: false, command: "completions", error: "Missing shell argument" });
		} else {
			errorOut("Error: missing shell argument");
			process.stderr.write("Usage: cn completions <bash|zsh|fish>\n");
		}
		throw new ExitError(1);
	}

	let script: string;
	switch (shell.toLowerCase()) {
		case "bash":
			script = generateBash();
			break;
		case "zsh":
			script = generateZsh();
			break;
		case "fish":
			script = generateFish();
			break;
		default:
			if (json) {
				jsonOut({
					success: false,
					command: "completions",
					error: `Unknown shell: ${shell}`,
					supported: ["bash", "zsh", "fish"],
				});
			} else {
				errorOut(`Error: unknown shell '${shell}'`);
				process.stderr.write("Supported shells: bash, zsh, fish\n");
			}
			throw new ExitError(1);
	}

	process.stdout.write(script);
	process.stdout.write("\n");
}
