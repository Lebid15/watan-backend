import { v2 as cloudinary } from 'cloudinary';

export function configureCloudinary() {
  const url = process.env.CLOUDINARY_URL;
  const name = process.env.CLOUDINARY_CLOUD_NAME;
  const key = process.env.CLOUDINARY_API_KEY;
  const secret = process.env.CLOUDINARY_API_SECRET;

  // فحص خفيف بعد تحميل .env (داخل الدالة فقط)
  console.log('Cloudinary env:', {
    url: !!url,
    name: !!name,
    key: !!key,
    secret: !!secret,
  });

  if (url) {
    // إذا CLOUDINARY_URL موجود يكفي استدعاء config بدون مفاتيح
    cloudinary.config({ secure: true });
  } else if (name && key && secret) {
    cloudinary.config({
      cloud_name: name,
      api_key: key,
      api_secret: secret,
      secure: true,
    });
  } else {
    throw new Error('Cloudinary environment variables are missing');
  }

  return cloudinary;
}
