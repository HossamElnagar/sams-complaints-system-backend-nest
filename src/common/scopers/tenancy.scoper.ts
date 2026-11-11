import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminRole } from '../../admins/enums/admin-role.enum.js';

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: AdminRole;
  branchId?: string | null;
  departmentId?: string | null;
}

export class TenancyScoper {
  /**
   * Builds the MongoDB query filter matching the authenticated user's authorization scope.
   */
  static getTicketQueryScope(user: AuthenticatedUser): Record<string, any> {
    switch (user.role) {
      case AdminRole.SUPER_ADMIN:
      case AdminRole.CENTRAL_COMPLAINTS_HEAD:
        // Full nationwide scope
        return {};

      case AdminRole.ACADEMY_PRESIDENT:
        // Only tickets explicitly escalated to the President's office
        return { 'routing.isEscalatedToPresident': true };

      case AdminRole.BRANCH_DEAN:
        if (!user.branchId) {
          throw new ForbiddenException('الحساب غير مرتبط بفرع مصرح به');
        }
        return {
          $or: [
            { branchId: new Types.ObjectId(user.branchId) },
            { 'routing.assignedBranchId': new Types.ObjectId(user.branchId) },
          ],
        };

      case AdminRole.DEPARTMENT_STAFF:
        if (!user.branchId || !user.departmentId) {
          throw new ForbiddenException('الحساب غير مرتبط بفرع أو قسم مصرح به');
        }
        return {
          $or: [
            {
              branchId: new Types.ObjectId(user.branchId),
              'routing.assignedDepartmentId': new Types.ObjectId(user.departmentId),
            },
            {
              'routing.assignedBranchId': new Types.ObjectId(user.branchId),
              'routing.assignedDepartmentId': new Types.ObjectId(user.departmentId),
            },
          ],
        };

      default:
        throw new ForbiddenException('الصلاحية غير معتمدة للنظام');
    }
  }

  /**
   * Asserts whether the authenticated user has permission to resolve or reject a ticket.
   */
  static assertCanResolve(user: AuthenticatedUser, ticket: any): void {
    if (user.role === AdminRole.SUPER_ADMIN) return;

    if (user.role === AdminRole.ACADEMY_PRESIDENT) {
      if (!ticket.routing?.isEscalatedToPresident) {
        throw new ForbiddenException('رئيس الأكاديمية مخول فقط بالبت في الشكاوى المصعدة لمكتبه');
      }
      return;
    }

    if (user.role === AdminRole.DEPARTMENT_STAFF) {
      const assignedBranch = ticket.routing?.assignedBranchId?.toString() || ticket.branchId?.toString();
      const assignedDept = ticket.routing?.assignedDepartmentId?.toString();

      if (assignedBranch !== user.branchId || assignedDept !== user.departmentId) {
        throw new ForbiddenException('لا تملك صلاحية البت في شكاوى خارج فرعك وقسمك المكلف');
      }
      return;
    }

    throw new ForbiddenException('فقط موظف القسم المختص أو مكتب رئيس الأكاديمية للشكاوى المصعدة يملكان صلاحية البت');
  }

  /**
   * Asserts whether the authenticated user has authority to dispatch or escalate.
   */
  static assertCanDispatch(user: AuthenticatedUser): void {
    if (
      user.role === AdminRole.SUPER_ADMIN ||
      user.role === AdminRole.CENTRAL_COMPLAINTS_HEAD
    ) {
      return;
    }
    throw new ForbiddenException('رئيسة الإدارة المركزية فقط تملك صلاحية توجيه الشكاوى أو تصعيدها');
  }
}
