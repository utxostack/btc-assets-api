import * as AddressValidator from 'multicoin-address-validator';
import { env } from '../env';
import { NetworkType } from '../constants';

const networkType =
  env.NETWORK === 'mainnet' ? NetworkType.mainnet : NetworkType.testnet;

export default function validateBitcoinAddress(address: string): boolean {
  return AddressValidator.validate(address, 'BTC', networkType);
}
