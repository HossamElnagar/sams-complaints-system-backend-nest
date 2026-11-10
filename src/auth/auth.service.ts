import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import {
  Admin,
  AdminDocument,
} from '../admins/schemas/admin.schema.js';

import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,

    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const admin = await this.adminModel
      .findOne({ email })
      .select('+password');

    if (!admin) {
      throw new UnauthorizedException(
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      );
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      admin.password,
    );

    if (!passwordMatches) {
      throw new UnauthorizedException(
        'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      );
    }


    const payload = {
      sub: admin._id.toString(),
    };

    const accessToken =
      await this.jwtService.signAsync(payload);

    return {
      message: 'تم تسجيل الدخول بنجاح',
      accessToken,
      tokenType: 'Bearer',
      admin: {
        id: admin._id.toString(),
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        branchId: admin.branch,
      },
    };
  }
}