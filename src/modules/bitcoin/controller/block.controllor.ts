import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { extendApi } from '@anatine/zod-openapi';
import { createZodDto } from '@anatine/zod-nestjs';
import { BitcoinService } from '../bitcoin.service';
import { BlockDto } from '../bitcoin.schema';

export const BlockTxids = extendApi(
  z.object({
    txids: z.array(z.string()),
  }),
);
class BlockTxidsDto extends createZodDto(BlockTxids) {}

export const BlockHeader = extendApi(
  z.object({
    header: z.string(),
  }),
);
class BlockHeaderDto extends createZodDto(BlockHeader) {}

export const BlockHash = extendApi(
  z.object({
    hash: z.string(),
  }),
);
class BlockHashDto extends createZodDto(BlockHash) {}

@Controller('bitcoin/v1/block')
@ApiTags('Bitcoin')
export class BitcoinBlockController {
  constructor(private bitcoinService: BitcoinService) {}

  @Get(':hash')
  @ApiOperation({ summary: 'Get a block by its hash' })
  @ApiResponse({
    status: 200,
    description: 'The block information',
    type: BlockDto,
  })
  public async getBlockByHash(@Param('hash') hash: string): Promise<BlockDto> {
    const block = await this.bitcoinService.getBlock({ hash });
    return block;
  }

  @Get(':hash/txids')
  @ApiOperation({ summary: 'Get transaction IDs of a block by its hash' })
  @ApiResponse({
    status: 200,
    description: 'The transaction IDs of the block',
    type: BlockTxidsDto,
  })
  public async getBlockTxids(@Param('hash') hash: string): Promise<BlockTxidsDto> {
    const txids = await this.bitcoinService.getBlockTxids({ hash });
    return { txids };
  }

  @Get(':hash/header')
  @ApiOperation({ summary: 'Get the header of a block by its hash' })
  @ApiResponse({
    status: 200,
    description: 'The block header',
    type: BlockHeaderDto,
  })
  public async getBlockHeader(@Param('hash') hash: string): Promise<BlockHeaderDto> {
    const header = await this.bitcoinService.getBlockHeader({ hash });
    return { header };
  }

  @Get('height/:height')
  @ApiOperation({ summary: 'Get a block by its height' })
  @ApiResponse({
    status: 200,
    description: 'the block hash of the block at the given height',
    type: BlockHashDto,
  })
  public async getBlockByHeight(@Param('height') height: number): Promise<BlockHashDto> {
    const [hash, chain] = await Promise.all([
      this.bitcoinService.getBlockHeight({ height }),
      this.bitcoinService.getBlockchainInfo(),
    ]);
    // can be optimized by using the chain.bestblockhash
    return { hash };
  }
}
