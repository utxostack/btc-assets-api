import { BI } from '@ckb-lumos/lumos';
import { remove0x } from '@rgbpp-sdk/btc';
import { hexToUtf8 } from '@rgbpp-sdk/ckb';

// https://github.com/ckb-cell/unique-cell?tab=readme-ov-file#xudt-information
export function decodeUniqueCellData(data: string) {
  const hex = remove0x(data);
  const decimal = BI.from(`0x${hex.slice(0, 2)}`).toNumber();
  const nameSize = BI.from(`0x${hex.slice(2, 4)}`).toNumber() * 2;
  const name = hexToUtf8(`0x${hex.slice(4, 4 + nameSize)}`);
  const symbolSize = BI.from(`0x${hex.slice(4 + nameSize, 4 + nameSize + 2)}`).toNumber() * 2;
  const symbol = hexToUtf8(`0x${hex.slice(4 + nameSize + 2, 4 + nameSize + 2 + symbolSize)}`);
  return {
    decimal,
    name,
    symbol,
  };
}
