import { Body, Controller, Post } from '@nestjs/common';
import { AccessToken, TokenService } from './token.service';
import { CreateTokenDto } from './dto/create-token.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('token')
@ApiTags('Token')
export class TokenController {
  constructor(private readonly tokenService: TokenService) {}

  @Post('generate')
  @ApiOperation({ summary: 'Generate a access token for the requester' })
  @ApiResponse({
    status: 201,
    description: 'The access token has been successfully generated',
    type: AccessToken,
  })
  genrateAccessToken(@Body() { app, domain }: CreateTokenDto): AccessToken {
    const token = this.tokenService.generateToken(app, domain);
    return token;
  }
}
