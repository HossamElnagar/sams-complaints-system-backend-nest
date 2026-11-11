import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Department, DepartmentSchema } from './schemas/department.schema.js';
import { DepartmentsService } from './departments.service.js';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Department.name, schema: DepartmentSchema }]),
  ],
  providers: [DepartmentsService],
  exports: [DepartmentsService, MongooseModule],
})
export class DepartmentsModule {}
