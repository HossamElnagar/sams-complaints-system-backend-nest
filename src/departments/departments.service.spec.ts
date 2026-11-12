import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DepartmentsService } from './departments.service.js';
import { Department } from './schemas/department.schema.js';

describe('DepartmentsService', () => {
  let service: DepartmentsService;

  const branchId = new Types.ObjectId();
  const deptId = new Types.ObjectId();
  const mockDept = {
    _id: deptId,
    name: 'قسم شؤون الطلاب',
    code: 'STU',
    branchId,
    isActive: true,
  };

  const mockDeptModel = {
    findOne: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
  };

  const MockableDeptModel = function (data: any) {
    return { ...mockDept, ...data, save: vi.fn().mockResolvedValue({ ...mockDept, ...data }) };
  };
  Object.assign(MockableDeptModel, mockDeptModel);

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DepartmentsService,
        {
          provide: getModelToken(Department.name),
          useValue: MockableDeptModel,
        },
      ],
    }).compile();

    service = module.get<DepartmentsService>(DepartmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('should create a department when no duplicate exists in the same branch', async () => {
      MockableDeptModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const result = await service.create({ name: 'قسم شؤون الطلاب', code: 'stu', branchId: branchId.toString() });
      expect(result).toBeDefined();
      expect(MockableDeptModel.findOne).toHaveBeenCalledWith({
        branchId,
        code: 'STU',
      });
    });

    it('should throw ConflictException if department code already exists in the same branch', async () => {
      MockableDeptModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockDept),
      });

      await expect(
        service.create({ name: 'مكرر', code: 'STU', branchId: branchId.toString() }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('findByBranch()', () => {
    it('should return all departments in a branch when onlyActive=false', async () => {
      MockableDeptModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([mockDept]) }),
      });

      const result = await service.findByBranch(branchId.toString(), false);
      expect(result).toHaveLength(1);
      expect(MockableDeptModel.find).toHaveBeenCalledWith({ branchId });
    });

    it('should filter only active departments when onlyActive=true', async () => {
      MockableDeptModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([mockDept]) }),
      });

      await service.findByBranch(branchId.toString(), true);
      expect(MockableDeptModel.find).toHaveBeenCalledWith({ branchId, isActive: true });
    });
  });

  describe('findById()', () => {
    it('should return a department when it exists', async () => {
      MockableDeptModel.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockDept),
      });

      const result = await service.findById(deptId.toString());
      expect(result._id).toEqual(deptId);
    });

    it('should throw NotFoundException when department does not exist', async () => {
      MockableDeptModel.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(service.findById(new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });
  });
});
