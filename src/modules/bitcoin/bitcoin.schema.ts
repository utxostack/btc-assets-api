import { createZodDto } from '@anatine/zod-nestjs';
import { extendApi } from '@anatine/zod-openapi';
import { z } from 'zod';

export const BlockchainInfo = extendApi(
  z.object({
    chain: z.string(),
    blocks: z.number(),
    bestblockhash: z.string(),
    difficulty: z.number(),
    mediantime: z.number(),
  }),
);
export class BlockchainInfoDto extends createZodDto(BlockchainInfo) {}

export const Block = extendApi(
  z.object({
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
  }),
);
export class BlockDto extends createZodDto(Block) {}

export const Status = extendApi(
  z.object({
    confirmed: z.boolean(),
    block_height: z.number().optional(),
    block_hash: z.string().optional(),
    block_time: z.number().optional(),
  }),
);
export class StatusDto extends createZodDto(Status) {}

export const Balance = extendApi(
  z.object({
    address: z.string(),
    satoshi: z.number(),
    pending_satoshi: z.number(),
    dust_satoshi: z.number(),
    utxo_count: z.number(),
  }),
);
export class BalanceDto extends createZodDto(Balance) {}

export const UTXO = extendApi(
  z.object({
    txid: z.string(),
    vout: z.number(),
    value: z.number(),
    status: Status,
  }),
);
export class UTXODto extends createZodDto(UTXO) {}

export const Output = extendApi(
  z.object({
    scriptpubkey: z.string(),
    scriptpubkey_asm: z.string(),
    scriptpubkey_type: z.string(),
    scriptpubkey_address: z.string().optional(),
    value: z.number(),
  }),
);
export class OutputDto extends createZodDto(Output) {}

export const Input = extendApi(
  z.object({
    txid: z.string(),
    vout: z.number(),
    prevout: Output.or(z.null()),
    scriptsig: z.string(),
    scriptsig_asm: z.string(),
    witness: z.array(z.string()).optional(),
    is_coinbase: z.boolean(),
    sequence: z.coerce.number(),
  }),
);
export class InputDto extends createZodDto(Input) {}

export const Transaction = extendApi(
  z.object({
    txid: z.string(),
    version: z.number(),
    locktime: z.number(),
    vin: z.array(Input),
    vout: z.array(Output),
    size: z.number(),
    weight: z.number(),
    fee: z.number(),
    status: Status,
  }),
);
export class TransactionDto extends createZodDto(Transaction) {}

export const RecommendedFees = extendApi(
  z.object({
    fastestFee: z.number(),
    halfHourFee: z.number(),
    hourFee: z.number(),
    economyFee: z.number(),
    minimumFee: z.number(),
  }),
);
export class RecommendedFeesDto extends createZodDto(RecommendedFees) {}
