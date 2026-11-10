import 'dotenv/config';
import mongoose from 'mongoose';
import * as bcrypt from 'bcrypt';

import { Admin, AdminSchema } from '../schemas/admin.schema.js';
import { AdminRole } from '../enums/admin-role.enum.js';

async function createSuperAdmin() {
  const mongoUri = process.env.MONGODB_URI;
  const fullName = process.env.SUPER_ADMIN_NAME;
  const role = process.env.SUPER_ADMIN_ROLE as AdminRole;
  const email = process.env.SUPER_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!mongoUri || !fullName || !email || !password || !role) {
    throw new Error('تأكد من إعداد MONGODB_URI وبيانات SUPER_ADMIN في .env');
  }

  if (password.length < 12) {
    throw new Error('كلمة مرور المسؤول يجب أن تكون 12 حرفًا على الأقل');
  }

  await mongoose.connect(mongoUri);

  try {
    const adminModel = mongoose.model(Admin.name, AdminSchema);

    const existingAdmin = await adminModel.findOne({ email });

    if (existingAdmin) {
      console.log('الحساب موجود بالفعل. لم يتم تغيير كلمة المرور أو الصلاحيات.');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    await adminModel.create({
      fullName,
      email,
      passwordHash,
      role: AdminRole.SUPER_ADMIN,
      isActive: true,
    });

    console.log('تم إنشاء حساب SUPER_ADMIN بنجاح.');
    console.log(`Email: ${email}`);
  } finally {
    await mongoose.disconnect();
  }
}

createSuperAdmin().catch((error) => {
  console.error('فشل إنشاء المسؤول:', error.message);
  process.exitCode = 1;
});
