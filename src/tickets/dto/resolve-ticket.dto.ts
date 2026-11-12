import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { TicketStatus } from '../schemas/ticket.schema.js';

export class ResolveTicketDto {
  @IsEnum([TicketStatus.Resolved, TicketStatus.Rejected], {
    message: 'الحالة النهائية يجب أن تكون "تم الحل" أو "مرفوضة"',
  })
  status: TicketStatus.Resolved | TicketStatus.Rejected;

  @IsString({ message: 'مبرر القرار يجب أن يكون نصاً' })
  @IsNotEmpty({ message: 'مبرر القرار إلزامي ولا يمكن تركه فارغاً' })
  @MinLength(10, { message: 'مبرر القرار يجب ألا يقل عن 10 أحرف لتوضيح أسباب الحل أو الرفض' })
  justification: string;
}
