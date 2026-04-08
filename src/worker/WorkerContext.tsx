import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { PerfLabWorkerClient } from './worker-client';

const WorkerContext = createContext<PerfLabWorkerClient | null>(null);

export function WorkerProvider({ children }: { children: ReactNode }) {
  const clientRef = useRef<PerfLabWorkerClient | null>(null);

  if (!clientRef.current) {
    clientRef.current = new PerfLabWorkerClient();
  }

  useEffect(() => {
    return () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    };
  }, []);

  return (
    <WorkerContext value={clientRef.current}>
      {children}
    </WorkerContext>
  );
}

export function useWorker(): PerfLabWorkerClient {
  const client = useContext(WorkerContext);
  if (!client) {
    throw new Error('useWorker must be used within a WorkerProvider');
  }
  return client;
}
