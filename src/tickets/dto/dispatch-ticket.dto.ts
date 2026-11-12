import { IsBoolean, IsMongoId, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class DispatchTicketDto {
  @ValidateIf((o) => !o.isEscalatedToPresident)
  @IsMongoId({ message: 'معرف الفرع يجب أن يكون معرفاً صحيحاً' })
  assignedBranchId?: string;

  @ValidateIf((o) => !o.isEscalatedToPresident)
  @IsMongoId({ message: 'معرف القسم يجب أن يكون معرفاً صحيحاً' })
  assignedDepartmentId?: string;

  @IsOptional()
  @IsBoolean({ message: 'حالة التصعيد يجب أن تكون قيمة منطقية' })
  isEscalatedToPresident?: boolean;

  @ValidateIf((o) => o.isEscalatedToPresident === true)
  @IsString({ message: 'سبب التصعيد لمكتب رئيس الأكاديمية مطلوب' })
  @MinLength(5, { message: 'سبب التصعيد يجب ألا يقل عن 5 أحرف' })
  escalationReason?: string;

  @IsOptional()
  @IsString({ message: 'ملاحظة التوجيه يجب أن تكون نصاً' })
  dispatchNote?: string;
}
