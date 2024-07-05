import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BitcoinService } from './bitcoin.service';
import { BlockchainInfoDto, BlockDto } from './bitcoin.schema';
import { z } from 'zod';
import { extendApi } from '@anatine/zod-openapi';
import { createZodDto } from '@anatine/zod-nestjs';

export const BlockTxids = extendApi(
  z.object({
    txids: z.array(z.string()),
  }),
);
class BlockTxidsDto extends createZodDto(BlockTxids) {}

@Controller('bitcoin/v1')
@ApiTags('Bitcoin')
export class BitcoinController {
  constructor(private bitcoinService: BitcoinService) {}

  @Get('info')
  @ApiOperation({ summary: 'Get information about the Bitcoin blockchain' })
  @ApiResponse({
    status: 200,
    description: 'The information about the Bitcoin blockchain',
    type: BlockchainInfoDto,
  })
  public async getBlockchainInfo(): Promise<BlockchainInfoDto> {
    const info = await this.bitcoinService.getBlockchainInfo();
    return info;
  }

  @Get('block/:hash')
  @ApiOperation({ summary: 'Get a block by its hash' })
  @ApiResponse({
    status: 200,
    description: 'The block information',
    type: BlockDto,
  })
  public async getBlockByHash(@Param('hash') hash: string) {
    const block = await this.bitcoinService.getBlock({ hash });
    return block;
  }

  @Get('block/:hash/txids')
  @ApiOperation({ summary: 'Get transaction IDs of a block by its hash' })
  @ApiResponse({
    status: 200,
    description: 'The transaction IDs of the block',
    type: BlockTxidsDto,
  })
  public async getBlockTxids(@Param('hash') hash: string) {
    const txids = await this.bitcoinService.getBlockTxids({ hash });
    return txids;
  }
}
