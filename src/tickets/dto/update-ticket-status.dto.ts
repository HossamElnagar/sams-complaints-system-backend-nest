import { IsEnum } from 'class-validator';
import { TicketStatus } from '../schemas/ticket.schema.js';


export class UpdateTicketStatusDto {
  @IsEnum(TicketStatus)
  status: TicketStatus;
}