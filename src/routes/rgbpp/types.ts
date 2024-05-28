import z from 'zod';

export const Script = z.object({
  codeHash: z.string(),
  args: z.string(),
  hashType: z.enum(['type', 'data', 'data1', 'data2']),
});
export type Script = z.infer<typeof Script>;

export const CellDep = z.object({
  outPoint: z
    .object({
      txHash: z.string(),
      index: z.string(),
    })
    .or(z.null()),
  depType: z.enum(['depGroup', 'code']),
});
export type CellDep = z.infer<typeof CellDep>;

export const InputCell = z.object({
  previousOutput: z
    .object({
      txHash: z.string(),
      index: z.string(),
    })
    .or(z.null()),
  since: z.string(),
});
export type InputCell = z.infer<typeof InputCell>;

export const OutputCell = z.object({
  capacity: z.string(),
  lock: Script,
  type: Script.or(z.null()).optional(),
});
export type OutputCell = z.infer<typeof OutputCell>;

export const Cell = z.object({
  cellOutput: OutputCell,
  data: z.string(),
  outPoint: z
    .object({
      txHash: z.string(),
      index: z.string(),
    })
    .or(z.null())
    .optional(),
  blockHash: z.string().optional(),
  blockNumber: z.string().optional(),
  txIndex: z.string().optional(),
});
export type Cell = z.infer<typeof Cell>;

export const CKBRawTransaction = z.object({
  version: z.string(),
  cellDeps: z.array(CellDep),
  headerDeps: z.array(z.string()),
  inputs: z.array(InputCell),
  outputs: z.array(OutputCell),
  outputsData: z.array(z.string()),
  witnesses: z.array(z.string()).default([]),
});
export type CKBRawTransaction = z.infer<typeof CKBRawTransaction>;

export const CKBTransaction = z.object({
  cellDeps: z.array(CellDep),
  inputs: z.array(InputCell),
  outputs: z.array(OutputCell),
  outputsData: z.array(z.string()),
  headerDeps: z.array(z.string()),
  hash: z.string(),
  version: z.string(),
  witnesses: z.array(z.string()),
});
export type CKBTransaction = z.infer<typeof CKBTransaction>;

export const CKBVirtualResult = z.object({
  ckbRawTx: CKBRawTransaction,
  commitment: z.string(),
  needPaymasterCell: z.boolean(),
  sumInputsCapacity: z.string(),
});
export type CKBVirtualResult = z.infer<typeof CKBVirtualResult>;

export const XUDTBalance = z.object({
  name: z.string(),
  decimal: z.number(),
  symbol: z.string(),
  amount: z.string(),
  typeHash: z.string(),
});
export type XUDTBalance = z.infer<typeof XUDTBalance>;
