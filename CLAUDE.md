# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Ralph TUI?

Ralph TUI is an **AI Agent Loop Orchestrator** - a terminal UI that automates the workflow of selecting tasks from a tracker, building prompts, executing AI coding agents (Claude Code, OpenCode), and detecting completion. It runs an autonomous loop until all tasks are done.

## Critical Coding Rules

1. Prioritize simple, clean, and maintainable solutions over clever or complex ones.
2. Make the smallest reasonable changes to achieve the desired outcome.
3. Never make unrelated code changes; document issues for later instead.
4. Preserve code comments unless you can prove they are actively false.
5. Start all code files with a file-level JSDoc comment section explaining the file's purpose, prefixed with "ABOUTME: ".
6. Avoid temporal context in comments; make them evergreen.

## Avoiding Entropy

This codebase will outlive you. Every shortcut you take becomes someone else's burden. Every hack compounds into technical debt that slows the whole team down.

You are not just writing code. You are shaping the future of this project. The patterns you establish will be copied. The corners you cut will be cut again.

**Fight entropy. Leave the codebase better than you found it.**

## Build & Development

This project uses **Bun** as its package manager and runtime.

```bash
bun install              # Install dependencies
bun run build            # Build for distribution
bun run typecheck        # Type check (no emit)
bun run lint             # ESLint check
bun run lint:fix         # Auto-fix lint issues
bun run dev              # Run in development mode
bun run clean            # Remove dist/
```

**After making code changes**, always run:
```bash
bun run typecheck && bun run build
```

**Run CLI directly in development:**
```bash
bun run ./src/cli.tsx run --prd ./prd.json
bun run ./src/cli.tsx --help
```

## Architecture Overview

```
src/
├── cli.tsx                 # Entry point, subcommand routing
├── commands/               # CLI commands (run, resume, setup, logs, etc.)
├── engine/                 # Core execution loop (SELECT→BUILD→EXECUTE→DETECT)
│   └── index.ts            # ExecutionEngine class - the heart of Ralph
├── plugins/
│   ├── agents/             # Agent plugins (claude, opencode)
│   │   ├── builtin/        # Built-in implementations
│   │   └── tracing/        # Subagent parsing (Task, Bash, Read, Write)
│   └── trackers/           # Tracker plugins (json, beads, beads-bv)
│       └── builtin/        # Built-in implementations
├── tui/                    # Terminal UI (OpenTUI + React)
│   └── components/         # React components for TUI
├── session/                # Session persistence (.ralph-tui-session.json)
├── logs/                   # Iteration log persistence
├── templates/              # Handlebars prompt templates
├── config/                 # Config loading/validation (Zod schemas)
├── setup/                  # Interactive setup wizard
├── prd/                    # PRD generation
└── chat/                   # AI chat for PRD creation
```

### Key Architectural Patterns

**Plugin Architecture**: Agents and trackers are extensible via plugin interfaces:
- `BaseAgentPlugin` / `AgentPlugin` interface in `src/plugins/agents/`
- `BaseTrackerPlugin` / `TrackerPlugin` interface in `src/plugins/trackers/`
- Registry pattern for dynamic loading (`registry.ts` files)

**Execution Engine** (`src/engine/index.ts`): The core loop that:
1. Selects next task from tracker (respecting priority + dependencies)
2. Builds prompt using Handlebars template + task data
3. Spawns agent process with streaming output
4. Parses output for `<promise>COMPLETE</promise>` completion token
5. Handles errors (retry/skip/abort), rate limits, fallback agents
6. Emits events (`EngineEvent`) for TUI updates

**Session Persistence** (`src/session/`): Crash recovery via `.ralph-tui-session.json`:
- Current iteration, task statuses, iteration history
- Lock mechanism prevents concurrent runs
- On resume, stale "in_progress" tasks reset to "open"

**Cross-Iteration Context** (`src/logs/progress.ts`): `.ralph-tui/progress.md` accumulates insights from prior iterations, injected into prompts via `{{recentProgress}}`.

### Adding a New Agent Plugin

1. Create `src/plugins/agents/builtin/my-agent.ts`
2. Extend `BaseAgentPlugin` and implement `execute()` method
3. Register in `src/plugins/agents/builtin/index.ts`
4. Handle streaming output, timeout, and graceful interruption

### Adding a New Tracker Plugin

1. Create `src/plugins/trackers/builtin/my-tracker.ts`
2. Extend `BaseTrackerPlugin` and implement `getTasks()`, `updateTaskStatus()`, etc.
3. Register in `src/plugins/trackers/builtin/index.ts`
4. Return unified `TrackerTask` objects with priority/dependency info

## Code Conventions

- **File Headers**: Every file starts with `// ABOUTME: ...` explaining its purpose
- **TypeScript**: Full strict mode, no implicit `any`
- **Indentation**: 2 spaces
- Preserve existing comments unless provably false
- Keep changes minimal and focused

## Issue Tracking

This project uses **bd** (Beads) for issue tracking:

```bash
bd ready                              # Find available work
bd show <id>                          # View issue details
bd update <id> --status in_progress   # Claim work
bd close <id>                         # Complete work
bd sync                               # Sync with git
```

### Using bv for AI-assisted triage

bv is a graph-aware triage engine for Beads projects (.beads/beads.jsonl). Instead of parsing JSONL or hallucinating graph traversal, use robot flags for deterministic, dependency-aware outputs with precomputed metrics (PageRank, betweenness, critical path, cycles, HITS, eigenvector, k-core).

**Scope boundary:** bv handles *what to work on* (triage, priority, planning). For agent-to-agent coordination (messaging, work claiming, file reservations), use [MCP Agent Mail](https://github.com/Dicklesworthstone/mcp_agent_mail).

**⚠️ CRITICAL: Use ONLY `--robot-*` flags. Bare `bv` launches an interactive TUI that blocks your session.**

#### The Workflow: Start With Triage

**`bv --robot-triage` is your single entry point.** It returns everything you need in one call:
- `quick_ref`: at-a-glance counts + top 3 picks
- `recommendations`: ranked actionable items with scores, reasons, unblock info
- `quick_wins`: low-effort high-impact items
- `blockers_to_clear`: items that unblock the most downstream work
- `project_health`: status/type/priority distributions, graph metrics
- `commands`: copy-paste shell commands for next steps

```bash
bv --robot-triage        # THE MEGA-COMMAND: start here
bv --robot-next          # Minimal: just the single top pick + claim command
```

#### Other Commands

**Planning:**
| Command | Returns |
|---------|---------|
| `--robot-plan` | Parallel execution tracks with `unblocks` lists |
| `--robot-priority` | Priority misalignment detection with confidence |

**Graph Analysis:**
| Command | Returns |
|---------|---------|
| `--robot-insights` | Full metrics: PageRank, betweenness, HITS (hubs/authorities), eigenvector, critical path, cycles, k-core, articulation points, slack |
| `--robot-label-health` | Per-label health: `health_level` (healthy\|warning\|critical), `velocity_score`, `staleness`, `blocked_count` |
| `--robot-label-flow` | Cross-label dependency: `flow_matrix`, `dependencies`, `bottleneck_labels` |
| `--robot-label-attention [--attention-limit=N]` | Attention-ranked labels by: (pagerank × staleness × block_impact) / velocity |

**History & Change Tracking:**
| Command | Returns |
|---------|---------|
| `--robot-history` | Bead-to-commit correlations: `stats`, `histories` (per-bead events/commits/milestones), `commit_index` |
| `--robot-diff --diff-since <ref>` | Changes since ref: new/closed/modified issues, cycles introduced/resolved |

**Other Commands:**
| Command | Returns |
|---------|---------|
| `--robot-burndown <sprint>` | Sprint burndown, scope changes, at-risk items |
| `--robot-forecast <id\|all>` | ETA predictions with dependency-aware scheduling |
| `--robot-alerts` | Stale issues, blocking cascades, priority mismatches |
| `--robot-suggest` | Hygiene: duplicates, missing deps, label suggestions, cycle breaks |
| `--robot-graph [--graph-format=json\|dot\|mermaid]` | Dependency graph export |
| `--export-graph <file.html>` | Self-contained interactive HTML visualization |

#### Scoping & Filtering

```bash
bv --robot-plan --label backend              # Scope to label's subgraph
bv --robot-insights --as-of HEAD~30          # Historical point-in-time
bv --recipe actionable --robot-plan          # Pre-filter: ready to work (no blockers)
bv --recipe high-impact --robot-triage       # Pre-filter: top PageRank scores
bv --robot-triage --robot-triage-by-track    # Group by parallel work streams
bv --robot-triage --robot-triage-by-label    # Group by domain
```

#### Understanding Robot Output

**All robot JSON includes:**
- `data_hash` — Fingerprint of source beads.jsonl (verify consistency across calls)
- `status` — Per-metric state: `computed|approx|timeout|skipped` + elapsed ms
- `as_of` / `as_of_commit` — Present when using `--as-of`; contains ref and resolved SHA

**Two-phase analysis:**
- **Phase 1 (instant):** degree, topo sort, density — always available immediately
- **Phase 2 (async, 500ms timeout):** PageRank, betweenness, HITS, eigenvector, cycles — check `status` flags

**For large graphs (>500 nodes):** Some metrics may be approximated or skipped. Always check `status`.

#### jq Quick Reference

```bash
bv --robot-triage | jq '.quick_ref'                        # At-a-glance summary
bv --robot-triage | jq '.recommendations[0]'               # Top recommendation
bv --robot-plan | jq '.plan.summary.highest_impact'        # Best unblock target
bv --robot-insights | jq '.status'                         # Check metric readiness
bv --robot-insights | jq '.Cycles'                         # Circular deps (must fix!)
bv --robot-label-health | jq '.results.labels[] | select(.health_level == "critical")'
```

**Performance:** Phase 1 instant, Phase 2 async (500ms timeout). Prefer `--robot-plan` over `--robot-insights` when speed matters. Results cached by data hash.

Use bv instead of parsing beads.jsonl—it computes PageRank, critical paths, cycles, and parallel tracks deterministically.

## Session Completion Workflow

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
