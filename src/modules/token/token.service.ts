import { BadRequestException, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiProperty } from '@nestjs/swagger';
import { randomUUID } from 'crypto';

export class AccessToken {
  @ApiProperty({ description: 'The unique identifier of the token' })
  id: string;

  @ApiProperty({ description: 'The access token' })
  token: string;
}

@Injectable()
export class TokenService {
  constructor(private readonly jwtService: JwtService) {}

  public generateToken(app: string, domain: string): AccessToken {
    // Ensure the domain is a valid URL and extract the host
    const url = domain.startsWith('http') ? domain : `https://${domain}`;
    const { host, pathname } = new URL(url);
    if (pathname !== '/') {
      throw new BadRequestException('Must be a valid domain without path');
    }

    const uuid = randomUUID();
    const token = this.jwtService.sign({ sub: app, aud: host, jti: uuid });
    return { id: uuid, token };
  }
}
