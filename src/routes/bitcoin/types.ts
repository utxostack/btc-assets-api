import { Static, Type } from '@fastify/type-provider-typebox';

export const ChainInfo = Type.Object({
  chain: Type.String(),
  blocks: Type.Number(),
  headers: Type.Number(),
  bestblockhash: Type.String(),
  difficulty: Type.Number(),
  mediantime: Type.Number(),
});

export const Status = Type.Object({
  confirmed: Type.Boolean(),
  block_height: Type.Number(),
  block_hash: Type.String(),
  block_time: Type.Number(),
});

export const Balance = Type.Object({
  address: Type.String(),
  satoshi: Type.Number(),
  pendingSatoshi: Type.Number(),
  utxoCount: Type.Number(),
});

export const UTXO = Type.Object({
  txid: Type.String(),
  vout: Type.Number(),
  value: Type.Number(),
  status: Status,
});

const Output = Type.Object({
  scriptpubkey: Type.String(),
  scriptpubkey_asm: Type.String(),
  scriptpubkey_type: Type.String(),
  scriptpubkey_address: Type.String(),
  value: Type.Number(),
});

const Input = Type.Object({
  txid: Type.String(),
  vout: Type.Number(),
  prevout: Output,
  scriptsig: Type.String(),
  scriptsig_asm: Type.String(),
  witness: Type.Array(Type.String()),
  is_coinbase: Type.Boolean(),
  sequence: Type.Number(),
});

export const Transaction = Type.Object({
  txid: Type.String(),
  version: Type.Number(),
  locktime: Type.Number(),
  vin: Type.Array(Input),
  vout: Type.Array(Output),
  size: Type.Number(),
  weight: Type.Number(),
  fee: Type.Number(),
  status: Status,
});

export type BalanceType = Static<typeof Balance>;
export type UTXOType = Static<typeof UTXO>;
export type TransactionType = Static<typeof Transaction>;
