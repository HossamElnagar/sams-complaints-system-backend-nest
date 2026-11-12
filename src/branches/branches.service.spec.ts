import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BranchesService } from './branches.service.js';
import { Branch } from './schemas/branch.schema.js';

describe('BranchesService', () => {
  let service: BranchesService;

  const branchId = new Types.ObjectId();
  const mockBranch = {
    _id: branchId,
    name: 'فرع القاهرة',
    code: 'CAI',
    isActive: true,
    save: vi.fn().mockResolvedValue({ _id: branchId, name: 'فرع القاهرة', code: 'CAI', isActive: true }),
  };

  const mockBranchModel = {
    findOne: vi.fn(),
    find: vi.fn(),
    findById: vi.fn(),
    findByIdAndUpdate: vi.fn(),
    constructor: vi.fn(),
  };

  // Allow `new branchModel(data)` to return a mock instance
  const MockableBranchModel = function (data: any) {
    return { ...mockBranch, ...data, save: vi.fn().mockResolvedValue({ ...mockBranch, ...data }) };
  };
  Object.assign(MockableBranchModel, mockBranchModel);

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchesService,
        {
          provide: getModelToken(Branch.name),
          useValue: MockableBranchModel,
        },
      ],
    }).compile();

    service = module.get<BranchesService>(BranchesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create()', () => {
    it('should create a branch successfully when no duplicate code exists', async () => {
      MockableBranchModel.findOne = vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(null) });

      const result = await service.create({ name: 'فرع القاهرة', code: 'cai' });
      expect(result).toBeDefined();
      expect(MockableBranchModel.findOne).toHaveBeenCalledWith({ code: 'CAI' });
    });

    it('should throw ConflictException if branch code already exists', async () => {
      MockableBranchModel.findOne = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockBranch),
      });

      await expect(service.create({ name: 'فرع مكرر', code: 'CAI' })).rejects.toThrow(ConflictException);
    });
  });

  describe('findAll()', () => {
    it('should return all branches (active and inactive) when onlyActive=false', async () => {
      MockableBranchModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([mockBranch]) }),
      });

      const results = await service.findAll(false);
      expect(results).toHaveLength(1);
      expect(MockableBranchModel.find).toHaveBeenCalledWith({});
    });

    it('should return only active branches when onlyActive=true', async () => {
      MockableBranchModel.find = vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([mockBranch]) }),
      });

      await service.findAll(true);
      expect(MockableBranchModel.find).toHaveBeenCalledWith({ isActive: true });
    });
  });

  describe('findById()', () => {
    it('should return a branch when found', async () => {
      MockableBranchModel.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(mockBranch),
      });

      const result = await service.findById(branchId.toString());
      expect(result._id).toEqual(branchId);
    });

    it('should throw NotFoundException when branch does not exist', async () => {
      MockableBranchModel.findById = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(service.findById(new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });
  });

  describe('update()', () => {
    it('should update and return the modified branch', async () => {
      const updatedBranch = { ...mockBranch, name: 'فرع القاهرة المحدث' };
      MockableBranchModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(updatedBranch),
      });

      const result = await service.update(branchId.toString(), { name: 'فرع القاهرة المحدث' });
      expect(result.name).toBe('فرع القاهرة المحدث');
    });

    it('should throw NotFoundException when branch to update does not exist', async () => {
      MockableBranchModel.findByIdAndUpdate = vi.fn().mockReturnValue({
        exec: vi.fn().mockResolvedValue(null),
      });

      await expect(service.update(new Types.ObjectId().toString(), { name: 'غير موجود' })).rejects.toThrow(NotFoundException);
    });
  });
});
