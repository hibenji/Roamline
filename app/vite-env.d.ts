/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MAPBOX_ACCESS_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*?worker' {
  const WorkerConstructor: {
    new (): Worker;
  };

  export default WorkerConstructor;
}
