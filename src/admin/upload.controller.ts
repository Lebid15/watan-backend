import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';

// دالة توليد اسم فريد للملف
function filenameBuilder(
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, filename: string) => void,
) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
  cb(null, uniqueSuffix + extname(file.originalname));
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/upload')
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: 'uploads', // ServeStaticModule يقدّم هذا المجلد على /uploads
        filename: filenameBuilder,
      }),
      limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
    }),
  )
  upload(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { url: null };

    // إزالة /api لو كانت موجودة في API_BASE_URL
    const baseUrl = process.env.API_BASE_URL?.replace(/\/api$/, '') || '';

    // إرجاع رابط كامل
    return { url: `${baseUrl}/uploads/${file.filename}` };
  }
}
