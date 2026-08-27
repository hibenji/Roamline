/// <reference lib="webworker" />

import { normalizeTimeline } from './timeline';

const workerScope = self as unknown as DedicatedWorkerGlobalScope;

workerScope.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer }>) => {
  try {
    workerScope.postMessage({ type: 'progress', percent: 12, label: 'Reading your export…' });
    const text = new TextDecoder().decode(event.data.buffer);
    workerScope.postMessage({
      type: 'progress',
      percent: 38,
      label: 'Understanding timeline segments…',
    });
    const payload = JSON.parse(text) as unknown;
    workerScope.postMessage({
      type: 'progress',
      percent: 68,
      label: 'Building routes and visits…',
    });
    const timeline = normalizeTimeline(payload);
    workerScope.postMessage({
      type: 'progress',
      percent: 92,
      label: 'Aggregating activity density…',
    });
    workerScope.postMessage({ type: 'success', data: timeline });
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? 'That file is not valid JSON.'
        : error instanceof Error
          ? error.message
          : 'Could not read this timeline.';
    workerScope.postMessage({ type: 'error', message });
  }
};

export {};
