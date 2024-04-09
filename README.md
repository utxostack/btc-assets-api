## Bitcoin/RGB++ Assets API

A service for Retrieving BTC/RGB++ information/assets and processing transactions with these assets

### Features
- Retrieving Blockchain Information such as Bitcoin chain info, blocks, headers, transactions, addresses and RGB++ assets
- Transaction Handling by posting transactions to the /bitcoin/v1/transaction or /rgbpp/v1/transaction/ckb-tx endpoint
- RGB++ CKB transaction Queue simplifies the RGB++ assets workflows by some cron jobs

### Deployment

#### Requirements

- [bitcoind](https://github.com/bitcoin/bitcoin): Running a Bitcoin full node
- [mempool/electrs](https://github.com/mempool/electrs): Electrum Rust Server (Electrs) indexes Bitcoin chain data
- [ckb-cell/ckb-bitcoin-spv-service](https://github.com/ckb-cell/ckb-bitcoin-spv-service): CKB Bitcoin SPV Service

#### Configuration

Copy the `.env.example` file to `.env`: 

```bash
cp .env.example .env
```

Update the configuration values:

```env
# Bitcoin network, testnet by default
NETWORK=testnet
# LOGGER_LEVEL=info

# Set /token/generate default domain param
# DOMAIN=localhost

# Trust all proxies (true) or do not trust any proxies (false)
# TRUST_PROXY=true

REDIS_URL=redis://redis:6379

# Sentry DSN URL for error tracking and cron monitoring
SENTRY_DSN_URL=<sentry_dsn_url>
# SENTRY_TRACES_SAMPLE_RATE=0.5
# SENTRY_PROFILES_SAMPLE_RATE=0.5

# Rate limit per minute for the API, 100 by default
RATE_LIMIT_PER_MINUTE=100
# The blocklist of IP addresses that are denied access to the API.
# IP_BLOCKLIST=

# Required in production mode
# In mainnet env, only the administrator could generate access tokens.
ADMIN_USERNAME=<admin_username>
ADMIN_PASSWORD=<admin_password>

# JWT_SECRET is used to sign the JWT token for authentication
JWT_SECRET=<your_secret>
# JWT token denylist
# JWT_DENYLIST=

# Bitcoin JSON-RPC URL and credentials
BITCOIN_JSON_RPC_URL=<http://bitcoin:8332>
BITCOIN_JSON_RPC_USERNAME=<rpc_username>
BITCOIN_JSON_RPC_PASSWORD=<rpc_password>

# Electrs API URL
BITCOIN_ELECTRS_API_URL=<http://electrs:3002>

# SPV Service URL
BITCOIN_SPV_SERVICE_URL=<http://spv:3001>

# CKB RPC URL
CKB_RPC_URL=https://testnet.ckb.dev/rpc

# Paymaster private key for CKB, used to sign the transaction
PAYMASTER_PRIVATE_KEY=
# Paymaster cell capacity in shannons
PAYMASTER_CELL_CAPACITY=31600000000
# Paymaster cell queue preset count, used to refill paymaster cell.
PAYMASTER_CELL_PRESET_COUNT=500
# Paymaster cell refill threshold, refill paymaster cell when the balance is less than this threshold.
PAYMASTER_CELL_REFILL_THRESHOLD=0.3
# Paymaster bitcoin address, used to receive BTC from users
PAYMASTER_RECEIVE_BTC_ADDRESS=<paymaster_btc_address>
# Paymaster receives BTC UTXO size in sats
PAYMASTER_BTC_CONTAINER_FEE_SATS=7000

# BTCTimeLock cell unlock batch size
UNLOCKER_CELL_BATCH_SIZE=100
# BTCTimeLock cell unlock cron job schedule, default is every 5 minutes
UNLOCKER_CRON_SCHEDULE='*/5 * * * *'
# BTCTimeLock cell unlocker monitor slug, used for monitoring unlocker status on sentry
UNLOCKER_MONITOR_SLUG=btctimelock-cells-unlocker

# RGB++ CKB transaction Queue cron job delay in milliseconds
# the /rgbpp/v1/transaction/ckb-tx endpoint is called, the transaction will be added to the queue
TRANSACTION_QUEUE_JOB_DELAY=12000
```

More configuration options can be found in the `src/env.ts` file.

#### Docker

Use the provided `docker-compose.yml` file to run the service:

```bash
docker-compose up
```

after the service is running, you can access the API documentation at `http://localhost:3000/docs`
