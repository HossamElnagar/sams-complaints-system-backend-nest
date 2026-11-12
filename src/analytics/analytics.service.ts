import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ticket, TicketDocument, TicketStatus } from '../tickets/schemas/ticket.schema.js';
import { Branch, BranchDocument } from '../branches/schemas/branch.schema.js';

export interface ExecutiveSummaryDto {
  totalTickets: number;
  openTickets: number;
  inProgressTickets: number;
  resolvedTickets: number;
  rejectedTickets: number;
  escalatedCount: number;
  resolutionRate: number;
  averageResolutionHours: number;
}

export interface BranchAnalyticsDto {
  branchId: string;
  name: string;
  code: string;
  total: number;
  resolved: number;
  inProgress: number;
  escalated: number;
  resolutionRate: number;
}

export interface CategoryAnalyticsDto {
  category: string;
  count: number;
  percentage: number;
}

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Ticket.name)
    private readonly ticketModel: Model<TicketDocument>,
    @InjectModel(Branch.name)
    private readonly branchModel: Model<BranchDocument>,
  ) {}

  /**
   * 1. Overview KPIs for Executive Management (President & High Leadership)
   */
  async getExecutiveSummary(): Promise<ExecutiveSummaryDto> {
    const totalTickets = await this.ticketModel.countDocuments().exec();

    const [
      openCount,
      inProgressCount,
      resolvedCount,
      rejectedCount,
      escalatedCount,
      resolvedDurations,
    ] = await Promise.all([
      this.ticketModel.countDocuments({
        status: { $in: [TicketStatus.Open, 'مفتوحة' as any, 'قيد الانتظار' as any] },
      }).exec(),
      this.ticketModel.countDocuments({ status: TicketStatus.InProgress }).exec(),
      this.ticketModel.countDocuments({ status: TicketStatus.Resolved }).exec(),
      this.ticketModel.countDocuments({ status: TicketStatus.Rejected }).exec(),
      this.ticketModel.countDocuments({ 'routing.isEscalatedToPresident': true }).exec(),
      this.ticketModel.aggregate([
        {
          $match: {
            status: TicketStatus.Resolved,
            'resolution.resolvedAt': { $exists: true, $ne: null },
          },
        },
        {
          $project: {
            durationHours: {
              $divide: [
                { $subtract: ['$resolution.resolvedAt', '$createdAt'] },
                1000 * 60 * 60,
              ],
            },
          },
        },
        {
          $group: {
            _id: null,
            avgHours: { $avg: '$durationHours' },
          },
        },
      ]).exec(),
    ]);

    const resolutionRate = totalTickets > 0 ? Math.round((resolvedCount / totalTickets) * 100) : 0;
    const avgHours = resolvedDurations.length > 0 && resolvedDurations[0].avgHours
      ? Math.round(resolvedDurations[0].avgHours * 10) / 10
      : 0;

    return {
      totalTickets,
      openTickets: openCount,
      inProgressTickets: inProgressCount,
      resolvedTickets: resolvedCount,
      rejectedTickets: rejectedCount,
      escalatedCount,
      resolutionRate,
      averageResolutionHours: avgHours,
    };
  }

  /**
   * 2. Performance and volume metrics aggregated across all active branches
   */
  async getBranchBreakdown(): Promise<BranchAnalyticsDto[]> {
    const branches = await this.branchModel.find({ isActive: true }).sort({ name: 1 }).exec();

    const branchAgg = await this.ticketModel.aggregate([
      {
        $group: {
          _id: {
            $ifNull: ['$routing.assignedBranchId', '$branchId'],
          },
          total: { $sum: 1 },
          resolved: {
            $sum: {
              $cond: [{ $eq: ['$status', TicketStatus.Resolved] }, 1, 0],
            },
          },
          inProgress: {
            $sum: {
              $cond: [{ $eq: ['$status', TicketStatus.InProgress] }, 1, 0],
            },
          },
          escalated: {
            $sum: {
              $cond: [{ $eq: ['$routing.isEscalatedToPresident', true] }, 1, 0],
            },
          },
        },
      },
    ]).exec();

    const aggMap = new Map<string, any>();
    for (const item of branchAgg) {
      if (item._id) {
        aggMap.set(item._id.toString(), item);
      }
    }

    return branches.map((branch) => {
      const stats = aggMap.get(branch._id.toString()) || {
        total: 0,
        resolved: 0,
        inProgress: 0,
        escalated: 0,
      };

      const rate = stats.total > 0 ? Math.round((stats.resolved / stats.total) * 100) : 0;

      return {
        branchId: branch._id.toString(),
        name: branch.name,
        code: branch.code,
        total: stats.total,
        resolved: stats.resolved,
        inProgress: stats.inProgress,
        escalated: stats.escalated,
        resolutionRate: rate,
      };
    });
  }

  /**
   * 3. Distribution of complaints by category
   */
  async getCategoryBreakdown(): Promise<CategoryAnalyticsDto[]> {
    const total = await this.ticketModel.countDocuments().exec();

    const agg = await this.ticketModel.aggregate([
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
    ]).exec();

    return agg.map((item) => ({
      category: item._id || 'أخرى',
      count: item.count,
      percentage: total > 0 ? Math.round((item.count / total) * 100) : 0,
    }));
  }

  /**
   * 4. Retrieve recent cases escalated to the President for immediate review
   */
  async getRecentEscalations(limit = 10) {
    return this.ticketModel
      .find({ 'routing.isEscalatedToPresident': true })
      .populate('branchId', 'name code')
      .populate('routing.assignedBranchId', 'name code')
      .populate('routing.assignedDepartmentId', 'name code')
      .sort({ updatedAt: -1 })
      .limit(limit)
      .exec();
  }

  /**
   * 5. Generate UTF-8 encoded Arabic CSV report for institutional recordkeeping
   */
  async generateCsvReport(): Promise<string> {
    const tickets = await this.ticketModel
      .find()
      .populate('branchId', 'name code')
      .populate('routing.assignedBranchId', 'name code')
      .populate('routing.assignedDepartmentId', 'name code')
      .sort({ createdAt: -1 })
      .exec();

    // UTF-8 BOM to guarantee proper Arabic display in MS Excel
    let csv = '\uFEFF';
    csv += 'رقم الشكوى,تاريخ التقديم,اسم الطالب,الرقم الجامعي,البريد الجامعي,رقم الهاتف,الفرع,القسم,التصنيف,الأولوية,الحالة,مصعدة للرئيس,مبررات التصعيد,قرار البت,تاريخ البت\n';

    for (const t of tickets) {
      const branchName = (t as any).routing?.assignedBranchId?.name || (t as any).branchId?.name || t.branch || 'غير محدد';
      const deptName = (t as any).routing?.assignedDepartmentId?.name || 'غير محدد';
      const createdDate = (t as any).createdAt ? new Date((t as any).createdAt).toLocaleDateString('ar-EG') : '';
      const resolvedDate = t.resolution?.resolvedAt ? new Date(t.resolution.resolvedAt).toLocaleDateString('ar-EG') : '';
      const isEscalated = t.routing?.isEscalatedToPresident ? 'نعم' : 'لا';
      const escalationReason = this.escapeCsv(t.routing?.escalationReason || '');
      const justification = this.escapeCsv(t.resolution?.justification || '');

      const row = [
        t.ticketNumber || t._id.toString(),
        createdDate,
        this.escapeCsv(t.studentName),
        this.escapeCsv(t.studentPhone || ''),
        this.escapeCsv(t.studentEmail),
        this.escapeCsv(t.studentPhone),
        this.escapeCsv(branchName),
        this.escapeCsv(deptName),
        this.escapeCsv(t.category),
        this.escapeCsv(t.priority),
        this.escapeCsv(t.status),
        isEscalated,
        escalationReason,
        justification,
        resolvedDate,
      ].join(',');

      csv += row + '\n';
    }

    return csv;
  }

  private escapeCsv(value: string): string {
    if (!value) return '""';
    const clean = String(value).replace(/"/g, '""').replace(/\r?\n/g, ' ');
    return `"${clean}"`;
  }
}
