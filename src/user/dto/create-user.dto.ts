// src/user/dto/create-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'test@example.com' })
  email: string;

  @ApiProperty({ example: '123456' })
  password: string;

  @ApiProperty({ example: 'أحمد محمد', required: false })
  fullName?: string;

  @ApiProperty({ example: 'ahmad', required: false })
  username?: string;

  @ApiProperty({ example: '+90', required: false })
  countryCode?: string;

  @ApiProperty({ example: '5551234567', required: false })
  phoneNumber?: string;

  @ApiProperty({ example: 'currency-uuid-here' })
  currencyId: string; // معرّف العملة التي يختارها المستخدم وقت التسجيل
}
