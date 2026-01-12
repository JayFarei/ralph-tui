/**
 * ABOUTME: PRD Chat application component for the Ralph TUI.
 * Provides an interactive chat interface for generating PRDs using an AI agent.
 * Manages conversation state, keyboard input, and PRD detection/saving.
 */

import type { ReactNode } from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useKeyboard } from '@opentui/react';
import { writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { ChatView } from './ChatView.js';
import { ChatEngine, createPrdChatEngine, slugify } from '../../chat/engine.js';
import type { ChatMessage, ChatEvent } from '../../chat/types.js';
import type { AgentPlugin } from '../../plugins/agents/types.js';

/**
 * Props for the PrdChatApp component
 */
export interface PrdChatAppProps {
  /** Agent plugin to use for generating responses */
  agent: AgentPlugin;

  /** Working directory for output */
  cwd?: string;

  /** Output directory for PRD files (default: ./tasks) */
  outputDir?: string;

  /** Timeout for agent calls in milliseconds */
  timeout?: number;

  /** Callback when PRD is successfully generated */
  onComplete: (prdPath: string, featureName: string) => void;

  /** Callback when user cancels */
  onCancel: () => void;

  /** Callback when an error occurs */
  onError?: (error: string) => void;
}

/**
 * Initial welcome message from the assistant
 */
const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: `I'll help you create a Product Requirements Document (PRD).

What feature would you like to build? Describe it in a few sentences, and I'll ask clarifying questions to understand your needs.`,
  timestamp: new Date(),
};

/**
 * PrdChatApp component - Main application for PRD chat generation
 */
export function PrdChatApp({
  agent,
  cwd = process.cwd(),
  outputDir = 'tasks',
  timeout = 180000,
  onComplete,
  onCancel,
  onError,
}: PrdChatAppProps): ReactNode {
  // State
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [streamingChunk, setStreamingChunk] = useState('');
  const [error, setError] = useState<string | undefined>();

  // Refs
  const engineRef = useRef<ChatEngine | null>(null);

  // Initialize chat engine
  useEffect(() => {
    const engine = createPrdChatEngine(agent, { cwd, timeout });

    // Subscribe to events
    const unsubscribe = engine.on((event: ChatEvent) => {
      switch (event.type) {
        case 'status:changed':
          // Could update UI based on status
          break;

        case 'prd:detected':
          // PRD was detected, save it
          void savePrd(event.prdContent, event.featureName);
          break;

        case 'error:occurred':
          setError(event.error);
          onError?.(event.error);
          break;
      }
    });

    engineRef.current = engine;

    return () => {
      unsubscribe();
    };
  }, [agent, cwd, timeout, onError]);

  /**
   * Save the PRD content to a file
   */
  const savePrd = async (content: string, featureName: string) => {
    try {
      const fullOutputDir = join(cwd, outputDir);

      // Ensure output directory exists
      try {
        await access(fullOutputDir);
      } catch {
        await mkdir(fullOutputDir, { recursive: true });
      }

      // Generate filename
      const slug = slugify(featureName);
      const filename = `prd-${slug}.md`;
      const filepath = join(fullOutputDir, filename);

      // Write the file
      await writeFile(filepath, content, 'utf-8');

      // Notify completion
      onComplete(filepath, featureName);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(`Failed to save PRD: ${errorMsg}`);
      onError?.(errorMsg);
    }
  };

  /**
   * Send a message to the agent
   */
  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || !engineRef.current || isLoading) {
      return;
    }

    const userMessage = inputValue.trim();
    setInputValue('');
    setIsLoading(true);
    setStreamingChunk('');
    setLoadingStatus('Sending to agent...');
    setError(undefined);

    // Add user message to display immediately
    const userMsg: ChatMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);

    try {
      const result = await engineRef.current.sendMessage(userMessage, {
        onChunk: (chunk) => {
          setStreamingChunk((prev) => prev + chunk);
        },
        onStatus: (status) => {
          setLoadingStatus(status);
        },
      });

      if (result.success && result.response) {
        // Add assistant response to messages
        setMessages((prev) => [...prev, result.response!]);
        setStreamingChunk('');
      } else if (!result.success) {
        setError(result.error || 'Failed to get response');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setError(errorMsg);
    } finally {
      setIsLoading(false);
      setLoadingStatus('');
    }
  }, [inputValue, isLoading]);

  /**
   * Handle keyboard input
   */
  const handleKeyboard = useCallback(
    (key: { name: string; sequence?: string }) => {
      // Don't process keys while loading
      if (isLoading) {
        // Allow Ctrl+C to cancel
        if (key.name === 'c' && key.sequence === '\x03') {
          // Could implement interrupt here
        }
        return;
      }

      switch (key.name) {
        case 'escape':
          onCancel();
          break;

        case 'return':
        case 'enter':
          void sendMessage();
          break;

        case 'backspace':
          setInputValue((prev) => prev.slice(0, -1));
          break;

        default:
          // Handle regular character input
          if (key.sequence && key.sequence.length === 1 && key.sequence.charCodeAt(0) >= 32) {
            setInputValue((prev) => prev + key.sequence);
          }
          break;
      }
    },
    [isLoading, sendMessage, onCancel]
  );

  useKeyboard(handleKeyboard);

  return (
    <ChatView
      title="PRD Creator"
      subtitle={`Using ${agent.meta.name}`}
      messages={messages}
      inputValue={inputValue}
      isLoading={isLoading}
      loadingStatus={loadingStatus}
      streamingChunk={streamingChunk}
      inputPlaceholder="Describe your feature..."
      error={error}
      inputEnabled={!isLoading}
      hint="[Enter] Send  [Esc] Cancel"
    />
  );
}
