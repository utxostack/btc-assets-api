import { Controller, Get } from '@nestjs/common';
import { BlockchainInfo } from './bitcoin.interface';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('bitcoin/v1')
@ApiTags('Bitcoin')
export class BitcoinController {
  @Get('info')
  @ApiOperation({ summary: 'Get information about the Bitcoin blockchain' })
  @ApiResponse({
    status: 200,
    description: 'The information about the Bitcoin blockchain',
    type: BlockchainInfo,
  })
  public async getBlockchainInfo(): Promise<BlockchainInfo> {}
}
