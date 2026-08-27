import { useCallback, useEffect, useRef, useState } from 'react';
import TimelineWorker from '../timeline.worker?worker';
import { type NormalizedTimeline, type TimelineWorkerMessage } from '../timeline';

export type TimelineLoadState = 'demo' | 'ready' | 'reading' | 'error';

type UseTimelineLoaderOptions = {
  onLoaded: (timeline: NormalizedTimeline) => void;
};

function isJsonFile(file: File) {
  return file.type === 'application/json' || file.name.toLowerCase().endsWith('.json');
}

export function useTimelineLoader({ onLoaded }: UseTimelineLoaderOptions) {
  const [loadState, setLoadState] = useState<TimelineLoadState>('demo');
  const [loadLabel, setLoadLabel] = useState('Synthetic demo · 4 days');
  const [loadMessage, setLoadMessage] = useState('');
  const [progress, setProgress] = useState(0);
  const workerRef = useRef<Worker | null>(null);

  const terminateWorker = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
  }, []);

  const resetLoader = useCallback(() => {
    terminateWorker();
    setLoadState('demo');
    setLoadLabel('Synthetic demo · 4 days');
    setLoadMessage('');
    setProgress(0);
  }, [terminateWorker]);

  const parseFile = useCallback(
    (file: File) => {
      if (!isJsonFile(file)) {
        setLoadState('error');
        setLoadMessage('Drop a Google Timeline JSON export to continue.');
        return;
      }

      terminateWorker();
      const worker = new TimelineWorker();
      workerRef.current = worker;
      setLoadState('reading');
      setLoadLabel(file.name);
      setLoadMessage('Your file is being read locally.');
      setProgress(4);

      worker.onmessage = (event: MessageEvent<TimelineWorkerMessage>) => {
        const message = event.data;
        if (message.type === 'progress') {
          setProgress(message.percent);
          setLoadMessage(message.label);
        }
        if (message.type === 'success') {
          onLoaded(message.data);
          setLoadState('ready');
          setLoadMessage('Loaded locally · nothing was uploaded');
          setProgress(100);
          terminateWorker();
        }
        if (message.type === 'error') {
          setLoadState('error');
          setLoadMessage(message.message);
          setProgress(0);
          terminateWorker();
        }
      };

      worker.onerror = () => {
        setLoadState('error');
        setLoadMessage('This export could not be parsed in the browser.');
        setProgress(0);
        terminateWorker();
      };

      void file
        .arrayBuffer()
        .then((buffer) => {
          if (workerRef.current === worker) worker.postMessage({ buffer }, [buffer]);
        })
        .catch(() => {
          setLoadState('error');
          setLoadMessage('The browser could not read that file.');
          terminateWorker();
        });
    },
    [onLoaded, terminateWorker],
  );

  useEffect(() => terminateWorker, [terminateWorker]);

  return { loadState, loadLabel, loadMessage, parseFile, progress, resetLoader };
}
