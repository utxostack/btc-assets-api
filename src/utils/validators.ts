import * as AddressValidator from 'multicoin-address-validator';
import { env } from '../env';
import { NetworkType } from '../constants';

export default function validateBitcoinAddress(address: string): boolean {
  return AddressValidator.validate(address, 'BTC', env.NETWORK === NetworkType.mainnet.toString() ? 'prod' : 'testnet');
}
