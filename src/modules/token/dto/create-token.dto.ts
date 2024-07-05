import { ApiProperty } from '@nestjs/swagger';

export class CreateTokenDto {
  @ApiProperty({
    description: 'The app name of the requester',
    default: 'my-app',
  })
  app: string;

  @ApiProperty({
    description:
      'The domain name of the requester, for CORS (needs to be consistent when calling origin request header)',
    default: 'domain.com',
  })
  domain: string;
}
