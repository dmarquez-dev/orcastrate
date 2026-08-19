/** Public surface of the transcript. The shell (T4) composes from here. */
export { TranscriptPane } from './TranscriptPane';
export { DispatchCard, dispatchedLaneIdOf, isDispatchEvent } from './DispatchCard';
export { TranscriptEventItem, type TranscriptEventItemProps } from './TranscriptEventItem';
export { buildLaneIndex, collectDispatchedLanes } from './lane-index';
export { testId } from '../shell/contract-runtime';
