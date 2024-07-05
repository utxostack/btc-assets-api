import { ApiProperty } from '@nestjs/swagger';

export class BlockchainInfo {
  @ApiProperty()
  chain: string;

  @ApiProperty()
  blocks: number;

  @ApiProperty()
  bestblockhash: string;

  @ApiProperty()
  difficulty: number;

  @ApiProperty()
  mediantime: number;
}
