import 'dotenv/config';
import z from 'zod';
import process from 'node:process';

const envSchema = z.object({
  PORT: z.string().optional(),
  ORDINALS_API_BASE_URL: z.string(),
  BITCOIN_JSON_RPC_URL: z.string(),
  BITCOIN_JSON_RPC_USERNAME: z.string(),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
