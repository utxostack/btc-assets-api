import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('token')
export class TokenController {
  constructor(private readonly appService: AppService) {}

  @Get('generate')
  genrateAccessToken(): string {
    return this.appService.getHello();
  }
}
