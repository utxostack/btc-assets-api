import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { TokenModule } from './modules/token/token.module';
import { BitcoinModule } from './modules/bitcoin/bitcoin.module';

@Module({
  imports: [TokenModule, BitcoinModule],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
