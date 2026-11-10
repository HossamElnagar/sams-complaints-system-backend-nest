import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { Admin } from '../admins/schemas/admin.schema.js';
import { RevokedToken } from './schemas/revoked-token.schema.js';
import { AdminRole } from '../admins/enums/admin-role.enum.js';

describe('AuthService', () => {
  let service: AuthService;

  const mockAdmin = {
    _id: '507f1f77bcf86cd799439011',
    fullName: 'System Administrator',
    email: 'admin@academy.edu',
    passwordHash: '',
    role: AdminRole.SUPER_ADMIN,
    branchId: null,
    departmentId: null,
    isActive: true,
  };

  const mockAdminModel = {
    findOne: vi.fn(),
  };

  const mockRevokedTokenModel = {
    findOne: vi.fn(),
    updateOne: vi.fn(),
  };

  const mockJwtService = {
    signAsync: vi.fn().mockResolvedValue('test.jwt.token'),
    decode: vi.fn().mockReturnValue({ exp: Math.floor(Date.now() / 1000) + 3600 }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getModelToken(Admin.name),
          useValue: mockAdminModel,
        },
        {
          provide: getModelToken(RevokedToken.name),
          useValue: mockRevokedTokenModel,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should hash password and verify successfully with bcrypt factor 12', async () => {
    const rawPassword = 'SecurePassword123!';
    const hashed = await service.hashPassword(rawPassword);

    expect(hashed).toBeDefined();
    expect(hashed.startsWith('$2')).toBe(true);

    const matches = await service.comparePassword(rawPassword, hashed);
    expect(matches).toBe(true);

    const invalidMatches = await service.comparePassword('WrongPassword', hashed);
    expect(invalidMatches).toBe(false);
  });

  it('should successfully login and return Bearer accessToken', async () => {
    const rawPassword = 'ValidPassword123!';
    const hashed = await service.hashPassword(rawPassword);

    mockAdminModel.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        ...mockAdmin,
        passwordHash: hashed,
      }),
    });

    const result = await service.login({
      email: 'admin@academy.edu',
      password: rawPassword,
    });

    expect(result.accessToken).toBe('test.jwt.token');
    expect(result.tokenType).toBe('Bearer');
    expect(result.admin.email).toBe('admin@academy.edu');
    expect(result.admin.role).toBe(AdminRole.SUPER_ADMIN);
  });

  it('should reject login with invalid password', async () => {
    const hashed = await service.hashPassword('CorrectPassword');

    mockAdminModel.findOne.mockReturnValue({
      select: vi.fn().mockResolvedValue({
        ...mockAdmin,
        passwordHash: hashed,
      }),
    });

    await expect(
      service.login({
        email: 'admin@academy.edu',
        password: 'IncorrectPassword',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should manage token revocation status correctly', async () => {
    mockRevokedTokenModel.updateOne.mockResolvedValue({ upsertedCount: 1 });
    await service.revokeToken('some.token');
    expect(mockRevokedTokenModel.updateOne).toHaveBeenCalled();

    mockRevokedTokenModel.findOne.mockReturnValue({
      select: vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue({ _id: 'revoked_id' }),
      }),
    });

    const isRevoked = await service.isTokenRevoked('some.token');
    expect(isRevoked).toBe(true);
  });
});
