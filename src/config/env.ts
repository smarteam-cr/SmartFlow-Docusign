import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  HUBSPOT_ACCESS_TOKEN: z.string().min(1, 'HUBSPOT_ACCESS_TOKEN is required'),

  DOCUSIGN_CLIENT_ID: z.string().min(1, 'DOCUSIGN_CLIENT_ID is required'),
  DOCUSIGN_IMPERSONATED_USER_ID: z
    .string()
    .uuid('DOCUSIGN_IMPERSONATED_USER_ID must be a valid UUID'),
  DOCUSIGN_PRIVATE_KEY: z.string().min(1, 'DOCUSIGN_PRIVATE_KEY is required'),
  DOCUSIGN_ACCOUNT_ID: z.string().min(1, 'DOCUSIGN_ACCOUNT_ID is required'),
  DOCUSIGN_BASE_PATH: z.string().min(1, 'DOCUSIGN_BASE_PATH is required'),

  TEMPLATE_PROVEEDOR_MAP: z.string().min(1, 'TEMPLATE_PROVEEDOR_MAP is required'),

  DOCUSIGN_CONNECT_HMAC_SECRET: z.string().min(1, 'DOCUSIGN_CONNECT_HMAC_SECRET is required'),
  HUBSPOT_PORTAL_ID: z.string().min(1, 'HUBSPOT_PORTAL_ID is required'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates a process.env-shaped object. Throws ZodError if invalid.
 * Pure function for testability — does NOT read process.env directly.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(source);
}

/**
 * Loads + validates process.env. Calls process.exit(1) with a friendly message
 * on failure. Use this from server.ts at boot.
 */
export function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Pino isn't initialized yet at boot — fall back to console.error for env failures.
    // Plain text (no emoji) for terminal/log-aggregator portability.
    console.error('[ERROR] Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}
