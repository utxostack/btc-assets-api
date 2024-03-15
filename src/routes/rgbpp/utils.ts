import { bytes, createBytesCodec, createFixedBytesCodec, molecule } from '@ckb-lumos/codec';

const { table } = molecule;

const fallbackBytesCodec = createBytesCodec({
  pack: bytes.bytify,
  unpack: bytes.hexify,
});

function createFallbackFixedBytesCodec(byteLength: number) {
  return createFixedBytesCodec({
    pack: bytes.bytify,
    unpack: bytes.hexify,
    byteLength,
  });
}

const byte = createFallbackFixedBytesCodec(1);
export const Bytes = fallbackBytesCodec;
export const Byte32 = createFallbackFixedBytesCodec(32);

export const TypeScript = table(
  {
    codeHash: Byte32,
    hashType: byte,
    args: Bytes,
  },
  ['codeHash', 'hashType', 'args'],
);
