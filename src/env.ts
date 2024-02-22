import 'dotenv/config';
import z from 'zod';
import process from 'node:process';

const envSchema = z.object({
  PORT: z.string().optional(),
  // ORDINALS_API_BASE_URL: z.string(),
  BITCOIN_JSON_RPC_URL: z.string(),
  BITCOIN_JSON_RPC_USERNAME: z.string(),
  BITCOIN_JSON_RPC_PASSWORD: z.string(),
  BITCOIN_ELECTRS_API_URL: z.string(),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
