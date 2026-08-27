import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig, type UserConfig } from 'vite';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';

const localBindingConfig = {
  main: 'vinext/server/app-router-entry',
  compatibility_flags: ['nodejs_compat'],
};

// Keep Wrangler and Miniflare state project-local. These are non-secret tool
// settings; application environment belongs in ignored `.env*` files.
process.env.WRANGLER_WRITE_LOGS ??= 'false';
process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

// Wrangler snapshots its log path while the Cloudflare plugin is imported.
const { cloudflare } = await import('@cloudflare/vite-plugin');

const viteConfig: UserConfig = {
  css: { postcss: { plugins: [tailwindcss()] } },
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    // Allow development previews through temporary tunnels such as trycloudflare.
    allowedHosts: true,
    ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
  },
  plugins: [
    ...vinext(),
    ...cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
      config: localBindingConfig,
    }),
  ],
};

export default defineConfig(viteConfig);
