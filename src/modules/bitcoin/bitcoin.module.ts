import { Module } from '@nestjs/common';
import { BitcoinService } from './bitcoin.service';
import { BitcoinBlockController } from './controller/block.controllor';
import { BitcoinInfoController } from './controller/info.controllor';

@Module({
  imports: [],
  controllers: [BitcoinInfoController, BitcoinBlockController],
  providers: [BitcoinService],
})
export class BitcoinModule {}
