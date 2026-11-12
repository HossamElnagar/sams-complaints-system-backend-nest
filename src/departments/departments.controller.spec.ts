import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DepartmentsController } from './departments.controller.js';
import { DepartmentsService } from './departments.service.js';

describe('DepartmentsController', () => {
  let controller: DepartmentsController;
  let departmentsService: DepartmentsService;

  const branchId = new Types.ObjectId();
  const deptId = new Types.ObjectId();
  const mockDept = {
    _id: deptId,
    name: 'قسم شؤون الطلاب',
    code: 'STU',
    branchId,
    isActive: true,
  };

  const mockDepartmentsService = {
    findByBranch: vi.fn(),
    findById: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DepartmentsController],
      providers: [
        { provide: DepartmentsService, useValue: mockDepartmentsService },
      ],
    }).compile();

    controller = module.get<DepartmentsController>(DepartmentsController);
    departmentsService = module.get<DepartmentsService>(DepartmentsService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /departments/branch/:branchId (findByBranch)', () => {
    it('should return only active departments by default (active query param absent)', async () => {
      mockDepartmentsService.findByBranch.mockResolvedValue([mockDept]);

      const result = await controller.findByBranch(branchId.toString(), undefined);
      expect(departmentsService.findByBranch).toHaveBeenCalledWith(branchId.toString(), true);
      expect(result).toHaveLength(1);
    });

    it('should return all departments when active=false', async () => {
      mockDepartmentsService.findByBranch.mockResolvedValue([
        mockDept,
        { ...mockDept, _id: new Types.ObjectId(), isActive: false },
      ]);

      const result = await controller.findByBranch(branchId.toString(), 'false');
      expect(departmentsService.findByBranch).toHaveBeenCalledWith(branchId.toString(), false);
      expect(result).toHaveLength(2);
    });
  });

  describe('GET /departments/:id (findById)', () => {
    it('should return a department by ID', async () => {
      mockDepartmentsService.findById.mockResolvedValue(mockDept);

      const result = await controller.findById(deptId.toString());
      expect(departmentsService.findById).toHaveBeenCalledWith(deptId.toString());
      expect(result._id).toEqual(deptId);
    });

    it('should propagate NotFoundException when department is not found', async () => {
      mockDepartmentsService.findById.mockRejectedValue(new NotFoundException('القسم غير موجود'));

      await expect(controller.findById(new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });
  });
});
