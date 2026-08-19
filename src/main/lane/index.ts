/**
 * Public surface of the lane module. Consumers (T4 PodRunner, T6 fixture
 * replay, T7 IPC handlers) import from here, never from the files beneath it.
 */

export { createLaneRouter } from './lane-router';
export {
  DISPATCH_TOOL_NAMES,
  TERMINAL_TASK_STATUSES,
  isDispatchTool,
  isTerminalTaskStatus,
} from './messages';
