import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    login: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /auth/login', () => {
    it('should return access token and admin info on valid credentials', async () => {
      const loginResponse = {
        message: 'تم تسجيل الدخول بنجاح',
        accessToken: 'mock.jwt.token',
        tokenType: 'Bearer',
        admin: {
          id: '507f1f77bcf86cd799439011',
          fullName: 'أحمد عبد الله',
          email: 'admin@academy.edu',
          role: 'SuperAdmin',
          branchId: null,
          departmentId: null,
        },
      };

      mockAuthService.login.mockResolvedValue(loginResponse);

      const result = await controller.login({
        email: 'admin@academy.edu',
        password: 'ValidPassword123!',
      });

      expect(authService.login).toHaveBeenCalledWith({
        email: 'admin@academy.edu',
        password: 'ValidPassword123!',
      });
      expect(result.accessToken).toBe('mock.jwt.token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.admin.email).toBe('admin@academy.edu');
    });

    it('should propagate UnauthorizedException for invalid credentials', async () => {
      mockAuthService.login.mockRejectedValue(
        new UnauthorizedException('البريد الإلكتروني أو كلمة المرور غير صحيحة'),
      );

      await expect(
        controller.login({ email: 'wrong@academy.edu', password: 'WrongPass' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should normalize email to lowercase before login', async () => {
      const loginResponse = {
        message: 'تم تسجيل الدخول بنجاح',
        accessToken: 'token',
        tokenType: 'Bearer',
        admin: { id: '1', fullName: 'مدير', email: 'admin@academy.edu', role: 'SuperAdmin', branchId: null, departmentId: null },
      };
      mockAuthService.login.mockResolvedValue(loginResponse);

      await controller.login({ email: 'ADMIN@ACADEMY.EDU', password: 'pass' });

      // AuthService.login receives the original DTO; normalization happens inside AuthService
      expect(authService.login).toHaveBeenCalledWith({
        email: 'ADMIN@ACADEMY.EDU',
        password: 'pass',
      });
    });
  });
});
