import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BitcoinService } from '../bitcoin.service';
import { BlockchainInfoDto } from '../bitcoin.schema';

@Controller('bitcoin/v1/info')
@ApiTags('Bitcoin')
export class BitcoinInfoController {
  constructor(private bitcoinService: BitcoinService) {}

  @Get()
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
}
