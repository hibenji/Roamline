export type RuntimeConfig = {
  mapboxAccessToken: string;
};

const emptyRuntimeConfig: RuntimeConfig = { mapboxAccessToken: '' };

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  try {
    const response = await fetch('/api/runtime-config', { cache: 'no-store' });
    if (!response.ok) return emptyRuntimeConfig;

    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null) return emptyRuntimeConfig;

    const mapboxAccessToken = (payload as { mapboxAccessToken?: unknown }).mapboxAccessToken;
    return {
      mapboxAccessToken: typeof mapboxAccessToken === 'string' ? mapboxAccessToken.trim() : '',
    };
  } catch {
    return emptyRuntimeConfig;
  }
}
