const ArrayBufferToHex = (arrayBuffer: ArrayBuffer): string => {
  return Array.prototype.map.call(new Uint8Array(arrayBuffer), (x) => ('00' + x.toString(16)).slice(-2)).join('');
};

const u32ToHex = (u32: string | number, littleEndian?: boolean): string => {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setUint32(0, Number(u32), littleEndian);
  return ArrayBufferToHex(buffer);
};

export const u32ToBe = (u32: string | number): string => {
  return u32ToHex(u32, false);
};

export const u32ToLe = (u32: string | number): string => {
  return u32ToHex(u32, true);
};

export const remove0x = (hex: string): string => {
  if (hex.startsWith('0x')) {
    return hex.substring(2);
  }
  return hex;
};

export const append0x = (hex?: string): string => {
  return hex?.startsWith('0x') ? hex : `0x${hex}`;
};
