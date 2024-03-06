import * as AddressValidator from 'multicoin-address-validator';
import { env } from '../env';

enum ValidatorNetworkType {
  mainnet = 'prod',
  testnet = 'testnet',
}

const networkType =
  env.NETWORK === 'mainnet' ? ValidatorNetworkType.mainnet : ValidatorNetworkType.testnet;

export default function validateBitcoinAddress(address: string): boolean {
  return AddressValidator.validate(address, 'BTC', networkType);
}
