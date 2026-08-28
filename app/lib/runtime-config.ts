export type RuntimeConfig = {
  cartoBasemapsApiKey: string;
};

const emptyRuntimeConfig: RuntimeConfig = { cartoBasemapsApiKey: '' };

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch('/api/runtime-config', { cache: 'no-store' });
    if (!response.ok) return emptyRuntimeConfig;

    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return emptyRuntimeConfig;

    const cartoBasemapsApiKey = (payload as { cartoBasemapsApiKey?: unknown }).cartoBasemapsApiKey;
    return {
      cartoBasemapsApiKey:
        typeof cartoBasemapsApiKey === 'string' ? cartoBasemapsApiKey.trim() : '',
    };
  } catch {
    return emptyRuntimeConfig;
  }
}
