import { opReturnScriptPubKeyToData } from '@rgbpp-sdk/btc';
import { Transaction } from '../routes/bitcoin/types';

export class OpReturnNotFoundError extends Error {
  constructor(txid: string) {
    super(`OP_RETURN output not found: ${txid}`);
    this.name = this.constructor.name;
  }
}

/**
 * Get commitment from Bitcoin transactions
 * depended on @rgbpp-sdk/btc opReturnScriptPubKeyToData method
 * @param tx - Bitcoin transaction
 */
export function getCommitmentFromBtcTx(tx: Transaction) {
  const opReturn = tx.vout.find((vout) => vout.scriptpubkey_type === 'op_return');
  if (!opReturn) {
    throw new OpReturnNotFoundError(tx.txid);
  }
  const buffer = Buffer.from(opReturn.scriptpubkey, 'hex');
  return opReturnScriptPubKeyToData(buffer);
}

export function tryGetCommitmentFromBtcTx(tx: Transaction) {
  try {
    return getCommitmentFromBtcTx(tx);
  } catch (error) {
    if (error instanceof OpReturnNotFoundError) {
      return null;
    }
    throw error;
  }
}
