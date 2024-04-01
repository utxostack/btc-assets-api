import 'dotenv/config';
import z from 'zod';
import process from 'node:process';
import { omit } from 'lodash';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().optional(),
  ADDRESS: z.string().optional(),
  NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),

  DOMAIN: z.string().optional(),

  SENTRY_DSN_URL: z.string().optional(),
  REDIS_URL: z.string(),
  RATE_LIMIT_PER_MINUTE: z.number().default(100),
  LOGGER_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

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

  /**
   * Bitcoin SPV service URL
   * https://github.com/ckb-cell/ckb-bitcoin-spv-service
   */
  BITCOIN_SPV_SERVICE_URL: z.string(),
  /**
   * The URL of the CKB JSON-RPC server.
   */
  CKB_RPC_URL: z.string(),
  /**
   * Paymaster private key, used to sign the transaction with paymaster cell.
   */
  PAYMASTER_PRIVATE_KEY: z.string(),
  /**
   * Paymaster cell capacity in shannons
  * (254 CKB for RGB++ capacity + 61 CKB for change cell capacity + 1 CKB for fee cell)
   */
  PAYMASTER_CELL_CAPACITY: z.coerce.number().default(316 * 10 ** 8),
  PAYMASTER_CELL_PRESET_COUNT: z.coerce.number().default(500),
  PAYMASTER_CELL_REFILL_THRESHOLD: z.coerce.number().default(0.3),

  UNLOCKER_CRON_SCHEDULE: z.string().default('*/5 * * * *'),
  UNLOCKER_CELL_BATCH_SIZE: z.coerce.number().default(100),
  UNLOCKER_MONITOR_SLUG: z.string().default('btctimelock-cells-unlock'),

  TRANSACTION_QUEUE_JOB_DELAY: z.coerce.number().default(120 * 1000),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);

export const getSafeEnvs = () =>
  omit(env, ['ADMIN_PASSWORD', 'JWT_SECRET', 'BITCOIN_JSON_RPC_PASSWORD', 'PAYMASTER_PRIVATE_KEY']);

export const isGenerateTokenPrivate = env.NODE_ENV === 'production' && env.ADMIN_USERNAME && env.ADMIN_PASSWORD;
