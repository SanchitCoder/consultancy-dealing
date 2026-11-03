import 'server-only';
import { DATA_MODE } from '@/lib/config';

export class ConfigError extends Error {}

function get(key: string, demo: string | null): string {
  const v = process.env[key]?.trim();
  if (v) return v;
  if (DATA_MODE === 'mock' && demo !== null) return demo;
  throw new ConfigError(`${key} is required when NEXT_PUBLIC_DATA_MODE=live. See .env.example.`);
}

/** Demo credentials shown on the login screen in mock mode only. */
export const DEMO = { ownerPassword: 'northstar-demo', consultantSeed: 'demo-consultant-seed' } as const;

export const serverEnv = {
  get ownerPassword() { return get('OWNER_PASSWORD', DEMO.ownerPassword); },
  get consultantSeed() { return get('CONSULTANT_LOGIN_SEED', DEMO.consultantSeed); },
  get n8nBaseUrl() { return get('N8N_BASE_URL', '').replace(/\/+$/, ''); },
  get authHeaderName() { return get('N8N_WEBHOOK_AUTH_HEADER_NAME', 'X-Api-Key'); },
  get authHeaderValue() { return get('N8N_WEBHOOK_AUTH_VALUE', ''); },
};
