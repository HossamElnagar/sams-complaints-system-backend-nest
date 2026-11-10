import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Branch, BranchDocument } from './schemas/branch.schema.js';

@Injectable()
export class BranchesService {
  constructor(
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
  ) {}

  async create(data: { name: string; code: string; isActive?: boolean }) {
    const existing = await this.branchModel.findOne({ code: data.code.toUpperCase() }).exec();
    if (existing) {
      throw new ConflictException(`فرع بالرمز ${data.code} مسجل بالفعل`);
    }
    const branch = new this.branchModel({
      name: data.name.trim(),
      code: data.code.trim().toUpperCase(),
      isActive: data.isActive ?? true,
    });
    return branch.save();
  }

  async findAll(onlyActive = false) {
    const filter = onlyActive ? { isActive: true } : {};
    return this.branchModel.find(filter).sort({ name: 1 }).exec();
  }

  async findById(id: string) {
    const branch = await this.branchModel.findById(id).exec();
    if (!branch) {
      throw new NotFoundException('الفرع غير موجود');
    }
    return branch;
  }

  async update(id: string, data: Partial<{ name: string; code: string; isActive: boolean }>) {
    const updated = await this.branchModel.findByIdAndUpdate(id, data, { new: true }).exec();
    if (!updated) {
      throw new NotFoundException('الفرع غير موجود');
    }
    return updated;
  }
}
