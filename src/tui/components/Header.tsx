/**
 * ABOUTME: Compact header component for the Ralph TUI.
 * Displays only essential info: status indicator, current task (if running), progress (X/Y), elapsed time.
 * Designed for minimal vertical footprint while providing clear visibility into current state.
 */

import type { ReactNode } from 'react';
import { colors, statusIndicators, formatElapsedTime, layout, type RalphStatus } from '../theme.js';
import type { HeaderProps } from '../types.js';

/**
 * Truncate text to fit within a given width, adding ellipsis if needed
 */
function truncateText(text: string, maxWidth: number): string {
  if (text.length <= maxWidth) return text;
  if (maxWidth <= 3) return text.slice(0, maxWidth);
  return text.slice(0, maxWidth - 1) + '…';
}

/**
 * Get compact status display for the current Ralph status.
 * Returns a short, scannable label optimized for the compact header.
 */
function getStatusDisplay(status: RalphStatus): { indicator: string; color: string; label: string } {
  switch (status) {
    case 'ready':
      return { indicator: statusIndicators.ready, color: colors.status.info, label: 'Ready' };
    case 'running':
      return { indicator: statusIndicators.running, color: colors.status.success, label: 'Running' };
    case 'selecting':
      return { indicator: statusIndicators.selecting, color: colors.status.info, label: 'Selecting' };
    case 'executing':
      return { indicator: statusIndicators.executing, color: colors.status.success, label: 'Executing' };
    case 'pausing':
      return { indicator: statusIndicators.pausing, color: colors.status.warning, label: 'Pausing' };
    case 'paused':
      return { indicator: statusIndicators.paused, color: colors.status.warning, label: 'Paused' };
    case 'stopped':
      return { indicator: statusIndicators.stopped, color: colors.fg.muted, label: 'Stopped' };
    case 'complete':
      return { indicator: statusIndicators.complete, color: colors.status.success, label: 'Complete' };
    case 'idle':
      return { indicator: statusIndicators.idle, color: colors.fg.muted, label: 'Idle' };
    case 'error':
      return { indicator: statusIndicators.blocked, color: colors.status.error, label: 'Error' };
  }
}

/**
 * Compact mini progress bar for header display
 */
function MiniProgressBar({
  completed,
  total,
  width,
}: {
  completed: number;
  total: number;
  width: number;
}): ReactNode {
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const filledWidth = Math.floor((percentage / 100) * width);
  const emptyWidth = width - filledWidth;

  const filledBar = '▓'.repeat(filledWidth);
  const emptyBar = '░'.repeat(emptyWidth);

  return (
    <text>
      <span fg={colors.status.success}>{filledBar}</span>
      <span fg={colors.fg.dim}>{emptyBar}</span>
    </text>
  );
}

/**
 * Compact header component showing essential information:
 * - Status indicator and label
 * - Current task (when executing)
 * - Agent and tracker plugin names (for configuration visibility)
 * - Progress (X/Y tasks) with mini bar
 * - Elapsed time
 */
export function Header({
  status,
  elapsedTime,
  currentTaskId,
  currentTaskTitle,
  completedTasks = 0,
  totalTasks = 0,
  agentName,
  trackerName,
}: HeaderProps): ReactNode {
  const statusDisplay = getStatusDisplay(status);
  const formattedTime = formatElapsedTime(elapsedTime);

  // Show abbreviated task title when executing (max 40 chars), fallback to task ID
  const isActive = status === 'executing' || status === 'running';
  const taskDisplay = isActive
    ? currentTaskTitle
      ? truncateText(currentTaskTitle, 40)
      : currentTaskId
        ? truncateText(currentTaskId, 20)
        : null
    : null;

  return (
    <box
      style={{
        width: '100%',
        height: layout.header.height,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: colors.bg.secondary,
        paddingLeft: 1,
        paddingRight: 1,
      }}
    >
      {/* Left section: Status indicator + label + optional current task */}
      <box style={{ flexDirection: 'row', gap: 1, flexShrink: 1 }}>
        <text>
          <span fg={statusDisplay.color}>{statusDisplay.indicator}</span>
          <span fg={statusDisplay.color}> {statusDisplay.label}</span>
        </text>
        {taskDisplay && (
          <text>
            <span fg={colors.fg.muted}> → </span>
            <span fg={colors.accent.tertiary}>{taskDisplay}</span>
          </text>
        )}
      </box>

      {/* Right section: Agent/Tracker + Progress (X/Y) with mini bar + elapsed time */}
      <box style={{ flexDirection: 'row', gap: 2, alignItems: 'center' }}>
        {/* Agent and tracker plugin names */}
        {(agentName || trackerName) && (
          <text fg={colors.fg.muted}>
            {agentName && <span fg={colors.accent.secondary}>{agentName}</span>}
            {agentName && trackerName && <span fg={colors.fg.dim}>/</span>}
            {trackerName && <span fg={colors.accent.tertiary}>{trackerName}</span>}
          </text>
        )}
        <box style={{ flexDirection: 'row', gap: 1, alignItems: 'center' }}>
          <MiniProgressBar completed={completedTasks} total={totalTasks} width={8} />
          <text fg={colors.fg.secondary}>
            {completedTasks}/{totalTasks}
          </text>
        </box>
        <text fg={colors.fg.muted}>⏱</text>
        <text fg={colors.fg.secondary}>{formattedTime}</text>
      </box>
    </box>
  );
}
