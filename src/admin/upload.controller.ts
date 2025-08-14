import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import { configureCloudinary } from '../utils/cloudinary.config';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';

@Controller('admin/upload')
@UseGuards(JwtAuthGuard, RolesGuard) // ✅ حماية JWT + التحقق من الصلاحيات
@Roles(UserRole.ADMIN)               // ✅ أدمن فقط
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),        // تخزين مؤقت في الذاكرة
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { error: 'لم يتم استلام أي ملف' };
    }

    const cloudinary = configureCloudinary();

    // رفع عبر stream لتفادي مشاكل الذاكرة
    const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'watan',
          resource_type: 'image',
          // يمكن السماح بأنواع محددة إذا رغبت:
          // allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        },
        (err, res) => {
          if (err) return reject(err);
          resolve(res as any);
        },
      );
      stream.end(file.buffer);
    });

    return { url: result.secure_url };
  }
}
