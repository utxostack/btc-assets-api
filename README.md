## Bitcoin/RGB++ Assets API

A service for Retrieving BTC/RGB++ information/assets and processing transactions with these assets

### Features

- Retrieving Blockchain Information such as Bitcoin chain info, blocks, headers, transactions, addresses and RGB++ assets
- Transaction Handling by posting transactions to the /bitcoin/v1/transaction or /rgbpp/v1/transaction/ckb-tx endpoint
- RGB++ CKB transaction Queue simplifies the RGB++ assets workflows by some cron jobs

### Deployment

#### Requirements

- [mempool.space](https://mempool.space/docs) or [mempool/electrs](https://github.com/mempool/electrs): provides data about the Bitcoin network.
  - We can use either of them as data provider
  - Or use both, designating one as the primary provider and the other as the fallback
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

# Bitcoin data provider, support mempool and electrs
# use electrs as default, mempool as fallback
# change to mempool if you want to use mempool.space as default and electrs as fallback
BITCOIN_DATA_PROVIDER=electrs
# Bitcoin Mempool.space API URL
# optinal when BITCOIN_DATA_PROVIDER=electrs
BITCOIN_MEMPOOL_SPACE_API_URL=https://mempool.space
# Electrs API URL
# optinal when BITCOIN_DATA_PROVIDER=mempool
BITCOIN_ELECTRS_API_URL=<http://electrs:3002>

# SPV Service URL
BITCOIN_SPV_SERVICE_URL=<http://spv:3001>

# CKB RPC URL
CKB_RPC_URL=https://testnet.ckb.dev/rpc

# Paymaster private key for CKB, used to sign the transaction
PAYMASTER_PRIVATE_KEY=
# Paymaster cell capacity in shannons
PAYMASTER_CELL_CAPACITY=31600000000
# Check the paymaster BTC UTXO when processing rgb++ ckb transaction
PAYMASTER_RECEIVE_UTXO_CHECK=false
# Paymaster bitcoin address, used to receive BTC from users
PAYMASTER_RECEIVE_BTC_ADDRESS=<paymaster_btc_address>
# Paymaster receives BTC UTXO size in sats
PAYMASTER_BTC_CONTAINER_FEE_SATS=7000

# BTCTimeLock cell unlock cron job schedule, default is every 5 minutes
UNLOCKER_CRON_SCHEDULE='*/5 * * * *'
# BTCTimeLock cell unlock batch size
UNLOCKER_CELL_BATCH_SIZE=100

# RGB++ CKB transaction Queue cron job delay in milliseconds
# the /rgbpp/v1/transaction/ckb-tx endpoint is called, the transaction will be added to the queue
TRANSACTION_QUEUE_JOB_DELAY=120000
# RGB++ CKB transaction Queue cron job attempts
TRANSACTION_QUEUE_JOB_ATTEMPTS=6
# Pay fee for transaction with pool reject by min fee rate, false by default
TRANSACTION_PAY_FOR_MIN_FEE_RATE_REJECT=false
```

More configuration options can be found in the `src/env.ts` file.

#### Docker

Use the provided `docker-compose.yml` file to run the service:

```bash
docker-compose up
```

after the service is running, you can access the API documentation at `http://localhost:3000/docs`
