import { v2 as cloudinary } from 'cloudinary';

let configured = false;

export function configureCloudinary() {
  if (!configured) {
    const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env || {};

    // فحص المتغيرات مع رسالة واضحة
    const missing: string[] = [];
    if (!CLOUDINARY_CLOUD_NAME) missing.push('CLOUDINARY_CLOUD_NAME');
    if (!CLOUDINARY_API_KEY) missing.push('CLOUDINARY_API_KEY');
    if (!CLOUDINARY_API_SECRET) missing.push('CLOUDINARY_API_SECRET');

    if (missing.length) {
      // نطبع تحذيرًا واضحًا في السيرفر (لن يخرج للمستخدم)
      // eslint-disable-next-line no-console
      console.error(
        `[Cloudinary] Missing env vars: ${missing.join(
          ', ',
        )}. Make sure your .env is loaded before Nest starts.`,
      );
    }

    cloudinary.config({
      cloud_name: CLOUDINARY_CLOUD_NAME,
      api_key: CLOUDINARY_API_KEY,
      api_secret: CLOUDINARY_API_SECRET,
    });

    configured = true;
  }
  return cloudinary;
}
