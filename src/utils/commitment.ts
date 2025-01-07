import { cloneDeep } from 'lodash';
import { opReturnScriptPubKeyToData } from '@rgbpp-sdk/btc';
import { calculateCommitment } from '@rgbpp-sdk/ckb';
import { RGBPP_TX_ID_PLACEHOLDER, BTCTimeLock, buildPreLockArgs, genBtcTimeLockArgs } from '@rgbpp-sdk/ckb';
import { Transaction } from '../routes/bitcoin/types';
import { isBtcTimeLock, isRgbppLock } from './lockscript';

export class OpReturnNotFoundError extends Error {
  constructor(txid: string) {
    super(`OP_RETURN output not found: ${txid}`);
    this.name = this.constructor.name;
  }
}

/**
 * Get commitment from the Bitcoin transaction
 * depended on @rgbpp-sdk/btc opReturnScriptPubKeyToData method
 * @param tx - Bitcoin transaction
 */
export function getCommitmentFromBtcTx(tx: Transaction): Buffer {
  const opReturn = tx.vout.find((vout) => vout.scriptpubkey_type === 'op_return');
  if (!opReturn) {
    throw new OpReturnNotFoundError(tx.txid);
  }
  const buffer = Buffer.from(opReturn.scriptpubkey, 'hex');
  return opReturnScriptPubKeyToData(buffer);
}

/**
 * Try to get commitment from the Bitcoin transactions, returns null if OP_RETURN output not found
 * depended on @rgbpp-sdk/btc opReturnScriptPubKeyToData method
 * @param tx - Bitcoin transaction
 */
export function tryGetCommitmentFromBtcTx(tx: Transaction): Buffer | null {
  try {
    return getCommitmentFromBtcTx(tx);
  } catch (error) {
    if (error instanceof OpReturnNotFoundError) {
      return null;
    }
    throw error;
  }
}

/**
 * Validate if the commitment matches the CKB transaction
 * @param commitment - The expected commitment from a Bitcoin transaction
 * @param ckbTx - The target CKB transaction or RawTransaction to compare with
 * @param lastTypeInputIndex - The last index of type script input in the ckbTx
 * @param lastTypeOutputIndex - The last index of type script output in the ckbTx
 */
export function isCommitmentMatchToCkbTx(
  commitment: string,
  ckbTx: CKBComponents.RawTransaction,
  lastTypeInputIndex: number,
  lastTypeOutputIndex: number,
) {
  function replaceLockArgsWithPlaceholder(cell: CKBComponents.CellOutput, outputIndex: number) {
    if (isRgbppLock(cell.lock)) {
      cell.lock.args = buildPreLockArgs(outputIndex + 1);
    }
    if (isBtcTimeLock(cell.lock)) {
      const { lockScript, after } = BTCTimeLock.unpack(cell.lock.args);
      cell.lock.args = genBtcTimeLockArgs(lockScript as CKBComponents.Script, RGBPP_TX_ID_PLACEHOLDER, after);
    }
    return cell;
  }

  // Use the ckb_tx to compare with the btc_tx commitment directly
  const finalTx = cloneDeep(ckbTx);
  finalTx.outputs = finalTx.outputs.map(replaceLockArgsWithPlaceholder);
  const finalTxCommitment = calculateCommitment(finalTx);
  if (commitment === finalTxCommitment) {
    return true;
  }

  // Slice inputs and outputs of the ckb_tx to simulate how the original ckb_virtual_result looks like
  const slicedTx = cloneDeep(ckbTx);
  slicedTx.inputs = slicedTx.inputs.slice(0, Math.max(lastTypeInputIndex, 0) + 1);
  slicedTx.outputs = slicedTx.outputs.slice(0, lastTypeOutputIndex + 1).map(replaceLockArgsWithPlaceholder);
  const slicedTxCommitment = calculateCommitment(slicedTx);
  if (commitment === slicedTxCommitment) {
    return true;
  }

  // If both commitments don't match the btc_tx commitment:
  // 1. The ckb_tx does not match to the commitment from the btc_tx (the usual case)
  // 2. The provided btc_tx commitment calculation is different from this function
  return false;
}
