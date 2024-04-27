import { z } from 'zod';

export const ChainInfo = z.object({
  chain: z.string(),
  blocks: z.number(),
  bestblockhash: z.string(),
  difficulty: z.number(),
  mediantime: z.number(),
});

export const Block = z.object({
  id: z.string(),
  height: z.number(),
  version: z.number(),
  timestamp: z.number(),
  tx_count: z.number(),
  size: z.number(),
  weight: z.number(),
  merkle_root: z.string(),
  previousblockhash: z.string(),
  mediantime: z.number(),
  nonce: z.number(),
  bits: z.number(),
  difficulty: z.number(),
});

export const Status = z.object({
  confirmed: z.boolean(),
  block_height: z.number().optional(),
  block_hash: z.string().optional(),
  block_time: z.number().optional(),
});

export const Balance = z.object({
  address: z.string(),
  satoshi: z.number(),
  pending_satoshi: z.number(),
  dust_satoshi: z.number(),
  utxo_count: z.number(),
});

export const UTXO = z.object({
  txid: z.string(),
  vout: z.number(),
  value: z.number(),
  status: Status,
});

const Output = z.object({
  scriptpubkey: z.string(),
  scriptpubkey_asm: z.string(),
  scriptpubkey_type: z.string(),
  scriptpubkey_address: z.string().optional(),
  value: z.number(),
});

const Input = z.object({
  txid: z.string(),
  vout: z.number(),
  prevout: Output.or(z.null()),
  scriptsig: z.string(),
  scriptsig_asm: z.string(),
  witness: z.array(z.string()).optional(),
  is_coinbase: z.boolean(),
  sequence: z.coerce.number(),
});

export const Transaction = z.object({
  txid: z.string(),
  version: z.number(),
  locktime: z.number(),
  vin: z.array(Input),
  vout: z.array(Output),
  size: z.number(),
  weight: z.number(),
  fee: z.number(),
  status: Status,
});

export const RecommendedFees = z.object({
  fastestFee: z.number(),
  halfHourFee: z.number(),
  hourFee: z.number(),
  economyFee: z.number(),
  minimumFee: z.number(),
});

export type ChainInfo = z.infer<typeof ChainInfo>;
export type Block = z.infer<typeof Block>;
export type Balance = z.infer<typeof Balance>;
export type UTXO = z.infer<typeof UTXO>;
export type Transaction = z.infer<typeof Transaction>;
export type RecommendedFees = z.infer<typeof RecommendedFees>;
