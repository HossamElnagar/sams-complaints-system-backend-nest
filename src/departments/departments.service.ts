import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Department, DepartmentDocument } from './schemas/department.schema.js';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectModel(Department.name)
    private readonly departmentModel: Model<DepartmentDocument>,
  ) {}

  async create(data: { name: string; code: string; branchId: string; isActive?: boolean }) {
    const branchObjectId = new Types.ObjectId(data.branchId);
    const existing = await this.departmentModel.findOne({
      branchId: branchObjectId,
      code: data.code.trim().toUpperCase(),
    }).exec();

    if (existing) {
      throw new ConflictException(`القسم بالرمز ${data.code} مسجل بالفعل لهذا الفرع`);
    }

    const department = new this.departmentModel({
      name: data.name.trim(),
      code: data.code.trim().toUpperCase(),
      branchId: branchObjectId,
      isActive: data.isActive ?? true,
    });
    return department.save();
  }

  async findByBranch(branchId: string, onlyActive = false) {
    const filter: any = { branchId: new Types.ObjectId(branchId) };
    if (onlyActive) {
      filter.isActive = true;
    }
    return this.departmentModel.find(filter).sort({ name: 1 }).exec();
  }

  async findById(id: string) {
    const department = await this.departmentModel.findById(id).exec();
    if (!department) {
      throw new NotFoundException('القسم غير موجود');
    }
    return department;
  }
}
