import 'dotenv/config';
import z from 'zod';
import process from 'node:process';
import { omit } from 'lodash';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.string().optional(),
  ADDRESS: z.string().optional(),
  NETWORK: z.enum(['mainnet', 'testnet']).default('testnet'),
  LOGGER_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  /**
   * Set /token/generate default domain param
   */
  DOMAIN: z.string().optional(),

  /**
   * Fastify `trustProxy` option
   * - only supports true/false: Trust all proxies (true) or do not trust any proxies (false).
   *
   * https://fastify.dev/docs/latest/Reference/Server/#trustproxy
   */
  TRUST_PROXY: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),

  /**
   * Redis URL, used for caching and rate limiting.
   */
  REDIS_URL: z.string(),

  /**
   * Sentry Configuration
   */
  SENTRY_DSN_URL: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().default(0.5),
  SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().default(0.5),

  /**
   * The rate limit per minute for each IP address.
   */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(100),
  /**
   * The blocklist of IP addresses that are denied access to the API.
   */
  IP_BLOCKLIST: z
    .string()
    .default('')
    .transform((value) => value.split(','))
    .pipe(z.string().array()),

  ADMIN_USERNAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),

  /**
   * JWT_SECRET is used to sign the JWT token for authentication.
   */
  JWT_SECRET: z.string(),
  /**
   * JWT_DENYLIST is used to store the denylisted JWT tokens.
   * support multiple tokens separated by comma, use token or jti to denylist.
   */
  JWT_DENYLIST: z
    .string()
    .default('')
    .transform((value) => value.split(','))
    .pipe(z.string().array()),
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
  /**
   * Paymaster cell queue preset count, used to refill paymaster cell.
   */
  PAYMASTER_CELL_PRESET_COUNT: z.coerce.number().default(500),
  /**
   * Paymaster cell refill threshold, refill paymaster cell when the balance is less than this threshold.
   */
  PAYMASTER_CELL_REFILL_THRESHOLD: z.coerce.number().default(0.3),

  /**
   * Paymaster receive UTXO check flag, used to check the paymaster BTC UTXO when processing rgb++ ckb transaction.
   */
  PAYMASTER_RECEIVE_UTXO_CHECK: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  /**
   * Paymaster bitcoin address, used to receive BTC from users.
   * enable paymaster BTC UTXO check if set.
   */
  PAYMASTER_RECEIVE_BTC_ADDRESS: z.string().optional(),
  /**
   * Paymaster receives BTC UTXO size in sats
   */
  PAYMASTER_BTC_CONTAINER_FEE_SATS: z.coerce.number().default(7000),

  /**
   * BTCTimeLock cell unlock batch size
   */
  UNLOCKER_CRON_SCHEDULE: z.string().default('*/5 * * * *'),
  /**
   * BTCTimeLock cell unlock cron job schedule, default is every 5 minutes
   */
  UNLOCKER_CELL_BATCH_SIZE: z.coerce.number().default(100),
  /**
   * BTCTimeLock cell unlocker monitor slug, used for monitoring unlocker status on sentry
   */
  UNLOCKER_MONITOR_SLUG: z.string().default('btctimelock-cells-unlock'),

  /**
   * RGB++ CKB transaction Queue cron job delay in milliseconds
   * the /rgbpp/v1/transaction/ckb-tx endpoint is called, the transaction will be added to the queue
   */
  TRANSACTION_QUEUE_JOB_DELAY: z.coerce.number().default(120 * 1000),
  /**
   * RGB++ CKB transaction Queue cron job attempts
   * used to retry the transaction queue job when failed
   */
  TRANSACTION_QUEUE_JOB_ATTEMPTS: z.coerce.number().default(6),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);

export const getSafeEnvs = () =>
  omit(env, ['ADMIN_PASSWORD', 'JWT_SECRET', 'BITCOIN_JSON_RPC_PASSWORD', 'PAYMASTER_PRIVATE_KEY']);

export const isAdminMode = env.NODE_ENV === 'production' && env.ADMIN_USERNAME && env.ADMIN_PASSWORD;
