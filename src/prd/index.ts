/**
 * ABOUTME: PRD creation module for ralph-tui.
 * Exports types, questions, generator, and wizard for PRD creation.
 */

// Types
export type {
  ClarifyingQuestion,
  ClarifyingAnswers,
  PrdUserStory,
  GeneratedPrd,
  PrdGenerationOptions,
  PrdGenerationResult,
  TrackerFormat,
  ConversionResult,
} from './types.js';

// Questions
export {
  CLARIFYING_QUESTIONS,
  getQuestionCount,
  getQuestionById,
  getQuestionIds,
} from './questions.js';

// Generator
export {
  slugify,
  generateBranchName,
  generateUserStories,
  generatePrd,
  renderPrdMarkdown,
  convertToPrdJson,
} from './generator.js';

// Wizard
export { runPrdWizard, prdExists } from './wizard.js';

// Parser
export type { ParsedPrd, ParseOptions } from './parser.js';
export { parsePrdMarkdown, parsedPrdToGeneratedPrd } from './parser.js';
