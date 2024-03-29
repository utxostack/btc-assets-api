## Bitcoin/RGB++ Assets API

A service for obtaining BTC/RGB++ asset data and performing transactions related to these assets

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

Create a `.env` file in the root directory with the following environment variables:

```env
# JWT_SECRET is used to sign the JWT token for authentication
JWT_SECRET=<your_secret>

REDIS_URL=redis://redis:6379

# Set /token/generate default domain param
DOMAIN=localhost

# Required in production mode
# In mainnet env, only the administrator could generate access tokens.
ADMIN_USERNAME=<admin_username>
ADMIN_PASSWORD=<admin_password>

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
PAYMASTER_CELL_PRESET_COUNT=500

# BTCTimeLock cell unlock batch size
UNLOCKER_CELL_BATCH_SIZE=100

# RGB++ CKB transaction Queue cron job delay in milliseconds
# the /rgbpp/v1/transaction/ckb-tx endpoint is called, the transaction will be added to the queue
TRANSACTION_QUEUE_JOB_DELAY=12000
```

#### Docker

Use the provided `docker-compose.yml` file to run the service:

```bash
docker-compose up
```

after the service is running, you can access the API documentation at `http://localhost:3000/docs`
