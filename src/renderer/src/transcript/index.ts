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
  filterTranscriptEvents,
  hiddenEventCount,
  type TranscriptFilterMode,
} from './transcript-filter';
export { TranscriptFilterToggle, filterToggleLabel } from './TranscriptFilterToggle';
export { testId } from '../shell/contract-runtime';
