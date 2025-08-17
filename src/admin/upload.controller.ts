import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  InternalServerErrorException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as multer from 'multer';
import type { Express } from 'express';
import { configureCloudinary } from '../utils/cloudinary';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '../auth/user-role.enum';

function getCloud() {
  return configureCloudinary();
}

@Controller('admin/upload')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UploadController {
  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: multer.memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ok = /^image\/(png|jpe?g|webp|gif|bmp|svg\+xml)$/i.test(file.mimetype);
        if (!ok) return cb(new Error('Only image files are allowed'), false);
        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      return { error: 'لم يتم استلام أي ملف' };
    }

    try {
      const cloudinary = getCloud();
      const result = await new Promise<{ secure_url: string }>((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          {
            folder: 'watan',
            resource_type: 'image',
          },
          (err, res) => {
            if (err) return reject(err);
            resolve(res as any);
          },
        );
        stream.end(file.buffer);
      });

      return { url: result.secure_url };
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error('[Admin Upload] Cloudinary error:', {
        message: err?.message,
        name: err?.name,
        http_code: err?.http_code,
      });
      throw new InternalServerErrorException('فشل رفع الملف، تحقق من إعدادات Cloudinary.');
    }
  }
}
