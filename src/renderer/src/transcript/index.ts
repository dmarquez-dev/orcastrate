/** Public surface of the transcript. The shell (T4) composes from here. */
export { TranscriptPane } from './TranscriptPane';
export { DispatchCard, dispatchedLaneIdOf, isDispatchEvent } from './DispatchCard';
export { TranscriptEventItem, type TranscriptEventItemProps } from './TranscriptEventItem';
export { buildLaneIndex, collectDispatchedLanes } from './lane-index';
export {
  CONVERSATION_EVENT_TYPES,
  DEFAULT_TRANSCRIPT_FILTER,
  DIAGNOSTIC_EVENT_TYPES,
  PLUMBING_EVENT_TYPES,
  STARTUP_RECONCILIATION_SUBTYPE,
  filterTranscriptEvents,
  hiddenEventCount,
  isStartupReconciliationNotice,
  type TranscriptFilterMode,
} from './transcript-filter';
export {
  TranscriptFilterToggle,
  filterToggleLabel,
  systemEventNoun,
} from './TranscriptFilterToggle';
export { ToolDisclosure, type ToolDisclosureProps } from './ToolDisclosure';
export { turnRoleOf, type TurnRole } from './turn-role';
export {
  PRIMARY_ARG_KEYS,
  TOOL_SUMMARY_MAX_CHARS,
  UNKNOWN_TOOL_NAME,
  summarizeToolCall,
  toolResultCharCount,
  toolResultSizeLabel,
} from './tool-summary';
export { testId } from '../shell/contract-runtime';
