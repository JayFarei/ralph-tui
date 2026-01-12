/**
 * ABOUTME: Create-PRD command for ralph-tui.
 * Uses AI-powered conversation to create Product Requirements Documents.
 * After PRD creation, offers to create tracker tasks automatically.
 */

import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { PrdChatApp } from '../tui/components/PrdChatApp.js';
import { loadStoredConfig, requireSetup } from '../config/index.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { registerBuiltinAgents } from '../plugins/agents/builtin/index.js';
import { promptSelect } from '../setup/prompts.js';
import type { AgentPlugin, AgentPluginConfig } from '../plugins/agents/types.js';

/**
 * Command-line arguments for the create-prd command.
 */
export interface CreatePrdArgs {
  /** Working directory */
  cwd?: string;

  /** Output directory for PRD files */
  output?: string;

  /** Number of user stories to generate */
  stories?: number;

  /** Force overwrite of existing files */
  force?: boolean;

  /** Override agent plugin */
  agent?: string;

  /** Timeout for agent calls in milliseconds */
  timeout?: number;
}

/**
 * Parse create-prd command arguments.
 */
export function parseCreatePrdArgs(args: string[]): CreatePrdArgs {
  const result: CreatePrdArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--cwd' || arg === '-C') {
      result.cwd = args[++i];
    } else if (arg === '--output' || arg === '-o') {
      result.output = args[++i];
    } else if (arg === '--stories' || arg === '-n') {
      const count = parseInt(args[++i] ?? '', 10);
      if (!isNaN(count)) {
        result.stories = count;
      }
    } else if (arg === '--force' || arg === '-f') {
      result.force = true;
    } else if (arg === '--agent' || arg === '-a') {
      result.agent = args[++i];
    } else if (arg === '--timeout' || arg === '-t') {
      const timeout = parseInt(args[++i] ?? '', 10);
      if (!isNaN(timeout)) {
        result.timeout = timeout;
      }
    } else if (arg === '--help' || arg === '-h') {
      printCreatePrdHelp();
      process.exit(0);
    }
  }

  return result;
}

/**
 * Print help for the create-prd command.
 */
export function printCreatePrdHelp(): void {
  console.log(`
ralph-tui create-prd - Create a new PRD with AI assistance

Usage: ralph-tui create-prd [options]
       ralph-tui prime [options]

Options:
  --cwd, -C <path>       Working directory (default: current directory)
  --output, -o <dir>     Output directory for PRD files (default: ./tasks)
  --agent, -a <name>     Agent plugin to use (default: from config)
  --timeout, -t <ms>     Timeout for AI agent calls (default: 180000)
  --force, -f            Overwrite existing files without prompting
  --help, -h             Show this help message

Description:
  Creates a Product Requirements Document (PRD) through an AI-powered conversation.

  The AI agent (using the ralph-tui-prd skill):
  1. Asks about the feature you want to build
  2. Asks contextual follow-up questions about users, requirements, and scope
  3. Generates a markdown PRD with user stories and acceptance criteria
  4. Offers to create tracker tasks (prd.json or beads)

  Requires an AI agent to be configured. Run 'ralph-tui setup' to configure one.

Examples:
  ralph-tui create-prd                      # Start AI-powered PRD creation
  ralph-tui prime                           # Alias for create-prd
  ralph-tui create-prd --agent claude       # Use specific agent
  ralph-tui create-prd --output ./docs      # Save PRD to custom directory
`);
}

/**
 * Get the configured agent plugin.
 */
async function getAgent(agentName?: string): Promise<AgentPlugin | null> {
  try {
    const cwd = process.cwd();
    const storedConfig = await loadStoredConfig(cwd);

    // Register built-in agents
    registerBuiltinAgents();
    const registry = getAgentRegistry();
    await registry.initialize();

    // Determine target agent
    const targetAgent = agentName || storedConfig.agent || storedConfig.defaultAgent || 'claude';

    // Build agent config
    const agentConfig: AgentPluginConfig = {
      name: targetAgent,
      plugin: targetAgent,
      options: storedConfig.agentOptions || {},
    };

    // Get agent instance
    const agent = await registry.getInstance(agentConfig);

    // Check if agent is ready
    const isReady = await agent.isReady();
    if (!isReady) {
      const detection = await agent.detect();
      if (!detection.available) {
        console.error(`Agent '${targetAgent}' is not available: ${detection.error || 'not detected'}`);
        return null;
      }
    }

    return agent;
  } catch (error) {
    console.error('Failed to load agent:', error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Available tracker options for task creation.
 */
interface TrackerOption {
  key: string;
  name: string;
  description: string;
  available: boolean;
  skillPrompt: string;
}

/**
 * Detect available trackers and return options.
 */
function getAvailableTrackers(cwd: string): TrackerOption[] {
  const beadsDir = path.join(cwd, '.beads');
  const hasBeads = fs.existsSync(beadsDir);

  return [
    {
      key: 'A',
      name: 'JSON (prd.json)',
      description: 'Simple JSON format, no external dependencies',
      available: true, // Always available
      skillPrompt: 'Convert this PRD to prd.json format using the ralph-tui-create-json skill.',
    },
    {
      key: 'B',
      name: 'Beads',
      description: 'Git-backed issue tracker with dependencies',
      available: hasBeads,
      skillPrompt: 'Convert this PRD to beads using the ralph-tui-create-beads skill.',
    },
    {
      key: 'C',
      name: 'Skip',
      description: "I'll create tasks manually",
      available: true,
      skillPrompt: '',
    },
  ];
}

/**
 * Prompt user to select a tracker for task creation.
 * Uses the shared promptSelect utility for consistent terminal handling.
 */
async function promptTrackerSelection(cwd: string): Promise<TrackerOption | null> {
  const trackers = getAvailableTrackers(cwd);
  const availableTrackers = trackers.filter((t) => t.available);

  // Small delay to allow terminal to fully restore after TUI cleanup
  await new Promise((r) => setTimeout(r, 100));

  // Build choices for promptSelect
  const choices = availableTrackers.map((t) => ({
    value: t.key,
    label: t.name,
    description: t.description,
  }));

  try {
    const selected = await promptSelect(
      'Would you like to create tasks for a tracker?',
      choices,
      { default: 'C' } // Default to skip
    );

    const tracker = availableTrackers.find((t) => t.key === selected);
    if (!tracker || tracker.key === 'C') {
      return null;
    }
    return tracker;
  } catch (err) {
    // Handle any readline errors gracefully
    console.error('Input error:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Run the agent with a skill to convert PRD to tracker tasks.
 */
async function runTrackerConversion(
  agent: AgentPlugin,
  prdPath: string,
  tracker: TrackerOption,
  cwd: string
): Promise<boolean> {
  console.log('');
  console.log(`Converting PRD to ${tracker.name} format...`);
  console.log('');

  // Build the prompt with the skill instruction and PRD path
  const prompt = `${tracker.skillPrompt}

The PRD file is at: ${prdPath}

Read the PRD and create the appropriate tasks.`;

  try {
    // Execute the agent with the conversion prompt
    const handle = agent.execute(prompt, [], { cwd });
    const result = await handle.promise;

    // Check if it succeeded
    if (result.status === 'completed' && result.exitCode === 0) {
      console.log('');
      console.log(`Tasks created successfully!`);
      return true;
    } else {
      console.error('');
      console.error('Task creation failed:', result.error || `Exit code: ${result.exitCode}`);
      return false;
    }
  } catch (error) {
    console.error('');
    console.error('Error running conversion:', error instanceof Error ? error.message : error);
    return false;
  }
}

/**
 * Run the AI-powered chat mode for PRD creation.
 */
async function runChatMode(parsedArgs: CreatePrdArgs): Promise<void> {
  // Get agent
  const agent = await getAgent(parsedArgs.agent);
  if (!agent) {
    console.error('');
    console.error('Chat mode requires an AI agent. Options:');
    console.error('  1. Run "ralph-tui setup" to configure an agent');
    console.error('  2. Use "--agent claude" or "--agent opencode" to specify one');
    process.exit(1);
  }

  const cwd = parsedArgs.cwd || process.cwd();
  const outputDir = parsedArgs.output || 'tasks';
  const timeout = parsedArgs.timeout || 180000;

  console.log(`Using agent: ${agent.meta.name}`);
  console.log('');

  // Create renderer and render the chat app
  const renderer = await createCliRenderer({
    exitOnCtrlC: false, // We handle Ctrl+C in the app
  });

  const root = createRoot(renderer);

  // Store PRD path for post-completion tracker selection
  let completedPrdPath: string | null = null;

  await new Promise<void>((resolve) => {
    const handleComplete = (prdPath: string, _featureName: string) => {
      root.unmount();
      renderer.destroy();
      console.log('');
      console.log(`PRD created: ${prdPath}`);
      completedPrdPath = prdPath;
      resolve();
    };

    const handleCancel = () => {
      root.unmount();
      renderer.destroy();
      console.log('');
      console.log('PRD creation cancelled.');
      resolve();
    };

    const handleError = (error: string) => {
      console.error('Error:', error);
    };

    root.render(
      <PrdChatApp
        agent={agent}
        cwd={cwd}
        outputDir={outputDir}
        timeout={timeout}
        onComplete={handleComplete}
        onCancel={handleCancel}
        onError={handleError}
      />
    );
  });

  // If PRD was created successfully, offer to create tracker tasks
  if (completedPrdPath) {
    const selectedTracker = await promptTrackerSelection(cwd);

    if (selectedTracker) {
      await runTrackerConversion(agent, completedPrdPath, selectedTracker, cwd);
    } else {
      console.log('');
      console.log('Next steps:');
      console.log(`  1. Review the PRD: ${completedPrdPath}`);
      console.log('  2. Convert to tasks: ralph-tui convert --to json ' + completedPrdPath);
      console.log('  3. Or run with beads: ralph-tui run --epic <epic-id>');
    }
  }
}

/**
 * Execute the create-prd command.
 * Always uses AI-powered chat mode for conversational PRD creation.
 */
export async function executeCreatePrdCommand(args: string[]): Promise<void> {
  const parsedArgs = parseCreatePrdArgs(args);
  const cwd = parsedArgs.cwd || process.cwd();

  // Verify setup is complete before running
  await requireSetup(cwd, 'ralph-tui prime');

  await runChatMode(parsedArgs);
  process.exit(0);
}
