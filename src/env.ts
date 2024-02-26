import 'dotenv/config';
import z from 'zod';
import process from 'node:process';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().optional(),
  JWT_SECRET: z.string(),
  BITCOIN_JSON_RPC_URL: z.string(),
  BITCOIN_JSON_RPC_USERNAME: z.string(),
  BITCOIN_JSON_RPC_PASSWORD: z.string(),
  BITCOIN_ELECTRS_API_URL: z.string(),
  SENTRY_DSN_URL: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
