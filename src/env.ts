import 'dotenv/config';
import z from 'zod';
import process from 'node:process';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().optional(),
  NETWORK: z.string().default('testnet'),

  SENTRY_DSN_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  RATE_LIMIT_PER_MINUTE: z.number().default(100),

  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  /**
   * JWT_SECRET is used to sign the JWT token for authentication.
   */
  JWT_SECRET: z.string(),
  /**
   * The URL/USERNAME/PASSWORD of the Bitcoin JSON-RPC server.
   * The JSON-RPC server is used to query the Bitcoin blockchain.
   */
  BITCOIN_JSON_RPC_URL: z.string(),
  BITCOIN_JSON_RPC_USERNAME: z.string(),
  BITCOIN_JSON_RPC_PASSWORD: z.string(),
  /**
   * The URL of the Electrs API.
   * Electrs is a Rust implementation of Electrum Server.
   * It is used to query the Bitcoin blockchain (balance, transactions, etc).
   */
  BITCOIN_ELECTRS_API_URL: z.string(),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
