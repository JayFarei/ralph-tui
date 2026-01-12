/**
 * ABOUTME: Create-PRD command for ralph-tui.
 * Starts interactive PRD creation wizard.
 * Supports both template-based wizard and AI-powered chat mode.
 * After PRD creation, offers to create tracker tasks automatically.
 */

import { createCliRenderer } from '@opentui/core';
import { createRoot } from '@opentui/react';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { runPrdWizard } from '../prd/index.js';
import type { PrdGenerationOptions } from '../prd/types.js';
import { PrdChatApp } from '../tui/components/PrdChatApp.js';
import { loadStoredConfig } from '../config/index.js';
import { getAgentRegistry } from '../plugins/agents/registry.js';
import { registerBuiltinAgents } from '../plugins/agents/builtin/index.js';
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

  /** Use AI-powered chat mode instead of template wizard */
  chat?: boolean;

  /** Override agent plugin for chat mode */
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
    } else if (arg === '--chat' || arg === '--ai') {
      result.chat = true;
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
ralph-tui create-prd - Create a new PRD interactively

Usage: ralph-tui create-prd [options]

Options:
  --cwd, -C <path>       Working directory (default: current directory)
  --output, -o <dir>     Output directory for PRD files (default: ./tasks)
  --stories, -n <count>  Number of user stories to generate (default: 5)
  --force, -f            Overwrite existing files without prompting
  --chat, --ai           Use AI-powered chat mode (requires agent)
  --agent, -a <name>     Agent plugin for chat mode (default: from config)
  --timeout, -t <ms>     Timeout for AI agent calls (default: 180000)
  --help, -h             Show this help message

Description:
  The init command creates a Product Requirements Document (PRD) for a new feature.

  Default mode (template wizard):
  1. Ask for a feature description
  2. Ask 3-5 clarifying questions about users, requirements, and success criteria
  3. Generate a markdown PRD with user stories and acceptance criteria
  4. Optionally generate a prd.json file for use with ralph-tui run

  AI chat mode (--chat):
  Uses an AI agent to have an adaptive conversation about your feature.
  The AI asks contextual follow-up questions and generates a high-quality PRD.
  Requires the ralph-tui-prd skill to be installed (run 'ralph-tui setup' to install).

Examples:
  ralph-tui create-prd                      # Start the template-based wizard
  ralph-tui create-prd --chat               # Start AI-powered chat mode
  ralph-tui create-prd --chat --agent claude  # Use specific agent
  ralph-tui create-prd --output ./docs      # Save PRD to custom directory
  ralph-tui create-prd --stories 10         # Generate more user stories (template mode)
  ralph-tui create-prd --force              # Overwrite existing PRD files
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
 */
async function promptTrackerSelection(cwd: string): Promise<TrackerOption | null> {
  const trackers = getAvailableTrackers(cwd);
  const availableTrackers = trackers.filter((t) => t.available);

  console.log('');
  console.log('Would you like to create tasks for a tracker?');
  console.log('');

  for (const tracker of availableTrackers) {
    console.log(`  ${tracker.key}. ${tracker.name} - ${tracker.description}`);
  }

  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question('Select option (A/B/C): ', (answer) => {
      rl.close();
      const normalized = answer.trim().toUpperCase();
      const selected = availableTrackers.find((t) => t.key === normalized);

      if (!selected || selected.key === 'C') {
        resolve(null);
      } else {
        resolve(selected);
      }
    });
  });
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
 */
export async function executeCreatePrdCommand(args: string[]): Promise<void> {
  const parsedArgs = parseCreatePrdArgs(args);

  // Check if chat mode is requested
  if (parsedArgs.chat) {
    await runChatMode(parsedArgs);
    process.exit(0);
  }

  // Default: template-based wizard
  const cwd = parsedArgs.cwd || process.cwd();
  const options: PrdGenerationOptions = {
    cwd,
    outputDir: parsedArgs.output,
    storyCount: parsedArgs.stories,
    force: parsedArgs.force,
  };

  const result = await runPrdWizard(options);

  if (result.cancelled) {
    process.exit(0);
  }

  if (!result.success) {
    console.error('PRD creation failed:', result.error);
    process.exit(1);
  }

  // Offer to create tracker tasks from the PRD
  if (result.markdownPath) {
    const selectedTracker = await promptTrackerSelection(cwd);

    if (selectedTracker) {
      // Get agent for conversion
      const agent = await getAgent(parsedArgs.agent);
      if (agent) {
        await runTrackerConversion(agent, result.markdownPath, selectedTracker, cwd);
      } else {
        console.log('');
        console.log('No agent configured. To create tasks automatically:');
        console.log('  1. Run "ralph-tui setup" to configure an agent');
        console.log('  2. Then run: ralph-tui convert --to json ' + result.markdownPath);
      }
    }
  }

  process.exit(0);
}
