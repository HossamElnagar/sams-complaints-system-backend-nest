import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BranchesController } from './branches.controller.js';
import { BranchesService } from './branches.service.js';

describe('BranchesController', () => {
  let controller: BranchesController;
  let branchesService: BranchesService;

  const branchId = new Types.ObjectId();
  const mockBranch = {
    _id: branchId,
    name: 'فرع القاهرة',
    code: 'CAI',
    isActive: true,
  };

  const mockBranchesService = {
    findAll: vi.fn(),
    findById: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BranchesController],
      providers: [
        { provide: BranchesService, useValue: mockBranchesService },
      ],
    }).compile();

    controller = module.get<BranchesController>(BranchesController);
    branchesService = module.get<BranchesService>(BranchesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /branches (findAll)', () => {
    it('should return only active branches by default (active query param absent)', async () => {
      mockBranchesService.findAll.mockResolvedValue([mockBranch]);

      const result = await controller.findAll(undefined);
      // When active is undefined/absent, onlyActive = (undefined !== 'false') = true
      expect(branchesService.findAll).toHaveBeenCalledWith(true);
      expect(result).toHaveLength(1);
      expect(result[0].code).toBe('CAI');
    });

    it('should return all branches when active=false query param is provided', async () => {
      mockBranchesService.findAll.mockResolvedValue([mockBranch, { ...mockBranch, _id: new Types.ObjectId(), isActive: false, code: 'ISK' }]);

      const result = await controller.findAll('false');
      expect(branchesService.findAll).toHaveBeenCalledWith(false);
      expect(result).toHaveLength(2);
    });
  });

  describe('GET /branches/:id (findById)', () => {
    it('should return a branch by ID', async () => {
      mockBranchesService.findById.mockResolvedValue(mockBranch);

      const result = await controller.findById(branchId.toString());
      expect(branchesService.findById).toHaveBeenCalledWith(branchId.toString());
      expect(result._id).toEqual(branchId);
    });

    it('should propagate NotFoundException when branch not found', async () => {
      mockBranchesService.findById.mockRejectedValue(new NotFoundException('الفرع غير موجود'));

      await expect(controller.findById(new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });
  });
});
