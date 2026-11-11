import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';

import { Admin, AdminDocument } from '../admins/schemas/admin.schema.js';
import { RevokedToken, RevokedTokenDocument } from './schemas/revoked-token.schema.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 12;

  constructor(
    @InjectModel(Admin.name)
    private readonly adminModel: Model<AdminDocument>,

    @InjectModel(RevokedToken.name)
    private readonly revokedTokenModel: Model<RevokedTokenDocument>,

    private readonly jwtService: JwtService,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.SALT_ROUNDS);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async login(dto: LoginDto) {
    const email = dto.email.trim().toLowerCase();

    const admin = await this.adminModel
      .findOne({ email, isActive: true })
      .select('+passwordHash');

    if (!admin) {
      throw new UnauthorizedException('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    const passwordHash = admin.passwordHash || (admin as any).password;
    const passwordMatches = await this.comparePassword(dto.password, passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedException('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    }

    const payload = {
      sub: admin._id.toString(),
      email: admin.email,
      role: admin.role,
      branchId: admin.branchId ? admin.branchId.toString() : null,
      departmentId: admin.departmentId ? admin.departmentId.toString() : null,
    };

    const accessToken = await this.jwtService.signAsync(payload);

    return {
      message: 'تم تسجيل الدخول بنجاح',
      accessToken,
      tokenType: 'Bearer',
      admin: {
        id: admin._id.toString(),
        fullName: admin.fullName,
        email: admin.email,
        role: admin.role,
        branchId: admin.branchId?.toString() ?? null,
        departmentId: admin.departmentId?.toString() ?? null,
      },
    };
  }

  /**
   * Revokes a token by inserting it into the TTL-indexed RevokedToken collection.
   */
  async revokeToken(token: string): Promise<void> {
    try {
      const decoded: any = this.jwtService.decode(token);
      const expiresAt = decoded?.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);

      await this.revokedTokenModel.updateOne(
        { token },
        { $setOnInsert: { token, expiresAt } },
        { upsert: true },
      );
    } catch {
      // Ignore malformed token decode errors during revocation
    }
  }

  /**
   * Checks if a token has been revoked.
   */
  async isTokenRevoked(token: string): Promise<boolean> {
    const found = await this.revokedTokenModel.findOne({ token }).select('_id').exec();
    return !!found;
  }
}
