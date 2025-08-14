import { v2 as cloudinary } from 'cloudinary';
console.log('🔎 CLOUDINARY_URL seen by app:', process.env.CLOUDINARY_URL ? 'SET' : 'MISSING');


// لا نقرأ أي مفاتيح هنا مسبقًا—نترك Cloudinary يقرأ CLOUDINARY_URL تلقائيًا من process.env وقت الاستدعاء
export function configureCloudinary() {
  cloudinary.config({ secure: true }); // يجعل الروابط https
  return cloudinary;
}
