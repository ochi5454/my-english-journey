import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const configSchema = z.object({
  SMTP_HOST: z.string().min(1, 'SMTP_HOST is required when MAIL_TRANSPORT=SMTP').optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.coerce.boolean().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  FROM_ADDRESS: z.string().min(1, 'FROM_ADDRESS is required').default(''),
  MAIL_TRANSPORT: z.enum(['SMTP', 'GRAPH']).default('SMTP'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(15),
  DRY_RUN: z.coerce.boolean().default(true),
  OUTPUT_DIR: z.string().default('output'),
  GRAPH_TENANT_ID: z.string().optional(),
  GRAPH_CLIENT_ID: z.string().optional(),
  GRAPH_CLIENT_SECRET: z.string().optional(),
});

export type AppConfig = z.infer<typeof configSchema>;

let cachedConfig: AppConfig | null = null;

export const loadConfig = (): AppConfig => {
  if (cachedConfig) return cachedConfig;
  const parsed = configSchema.safeParse(process.env);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; ');
    throw new Error(`Invalid configuration: ${message}`);
  }
  cachedConfig = parsed.data;
  return cachedConfig;
};
