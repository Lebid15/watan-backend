// src/user/create-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'test@example.com' })
  email: string;

  @ApiProperty({ example: '123456' })
  password: string;

  @ApiProperty({ example: 'أحمد محمد', required: false })
  fullName?: string;

  @ApiProperty({ example: '+905551234567', required: false })
  phoneNumber?: string;
}
