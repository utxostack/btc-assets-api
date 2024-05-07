## Upgrading to V2

We have released v2.0.0 for support `mempool.space` API as a Bitcoin data provider, and it 
provides a set of [IBitcoinDataProvider](https://github.com/ckb-cell/btc-assets-api/blob/8fb495576c957e9006ef648d6c24312a3f10e34f/src/services/bitcoin/interface.ts#L3) interfaces. Note that it is still compatible with the `electrs` used previously. 

There are two ways to upgrade: 

### Upgrading from v1.x.x and use electrs (**compatible, by default**)
Suppose you do not want to use the mempool.space API as the main data provider, **you do not need to make any changes**. 

But we recommend you remove the following env vars for safety:

```env
BITCOIN_JSON_RPC_URL=<http://bitcoin:8332>
BITCOIN_JSON_RPC_USERNAME=<rpc_username>
BITCOIN_JSON_RPC_PASSWORD=<rpc_password>
```

and add the following env vars to make sure to use electrs as the primary data provider, and add mempool.space API as a fallback:

```env
BITCOIN_DATA_PROVIDER=electrs # recommend, electrs by default
BITCOIN_MEMPOOL_SPACE_API_URL=https://mempool.space # optional, mempool.space as the fallback
```

### Upgrading from v1.x.x and using mempool.space API (**new feature**)
The new feature in v2.0.0, we can use mempool.space API as the primary data provider, and use electrs as a fallback.

Add the following env vars:

```env
BITCOIN_DATA_PROVIDER=mempool 
BITCOIN_MEMPOOL_SPACE_API_URL=https://mempool.space
```

If you want to use the previous electrs as a fallback, keep the original `BITCOIN_ELECTRS_API_URL` env var. Otherwise, remove this var to avoid using electrs.

```env
BITCOIN_ELECTRS_API_URL=<http://electrs:3002> # optional, electrs as fallback
```

#### Recommended Fees API
If use mempool.space API as the primary data provider, then we can use `/bitcoin/v1/fees/recommended` to get the bitcoin fees. and we will calculate fees when mempool.space recommend fees API unavailable (see https://github.com/ckb-cell/btc-assets-api/pull/114).

**use electrs as the primary data provider and dosen't set `BITCOIN_MEMPOOL_SPACE_API_URL` as a fallback, then recommended fees API will be unavailable**




