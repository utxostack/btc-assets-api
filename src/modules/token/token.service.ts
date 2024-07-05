import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenService {
  getHello(): string {
    return 'Hello World!';
  }
}
