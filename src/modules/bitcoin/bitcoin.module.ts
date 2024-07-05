import { Module } from '@nestjs/common';
import { BitcoinService } from './bitcoin.service';
import { BitcoinController } from './bitcoin.controller';

@Module({
  imports: [],
  controllers: [BitcoinController],
  providers: [BitcoinService],
})
export class BitcoinModule {}
