import { TenancyScoper, AuthenticatedUser } from './tenancy.scoper.js';
import { AdminRole } from '../../admins/enums/admin-role.enum.js';
import { ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';

describe('TenancyScoper', () => {
  const branchId = new Types.ObjectId().toString();
  const departmentId = new Types.ObjectId().toString();

  it('SUPER_ADMIN should have empty nationwide query scope', () => {
    const user: AuthenticatedUser = {
      userId: '1',
      email: 'admin@academy.edu',
      role: AdminRole.SUPER_ADMIN,
    };
    const scope = TenancyScoper.getTicketQueryScope(user);
    expect(scope).toEqual({});
  });

  it('CENTRAL_COMPLAINTS_HEAD should have empty nationwide query scope', () => {
    const user: AuthenticatedUser = {
      userId: '2',
      email: 'head@academy.edu',
      role: AdminRole.CENTRAL_COMPLAINTS_HEAD,
    };
    const scope = TenancyScoper.getTicketQueryScope(user);
    expect(scope).toEqual({});
  });

  it('ACADEMY_PRESIDENT query scope should strictly filter escalated tickets', () => {
    const user: AuthenticatedUser = {
      userId: '3',
      email: 'president@academy.edu',
      role: AdminRole.ACADEMY_PRESIDENT,
    };
    const scope = TenancyScoper.getTicketQueryScope(user);
    expect(scope).toEqual({ 'routing.isEscalatedToPresident': true });
  });

  it('BRANCH_DEAN should be strictly scoped to their assigned branch', () => {
    const user: AuthenticatedUser = {
      userId: '4',
      email: 'dean@academy.edu',
      role: AdminRole.BRANCH_DEAN,
      branchId,
    };
    const scope = TenancyScoper.getTicketQueryScope(user);
    expect(scope.$or).toBeDefined();
    expect(scope.$or[0].branchId).toEqual(new Types.ObjectId(branchId));
  });

  it('DEPARTMENT_STAFF should be strictly scoped to assigned branch and department', () => {
    const user: AuthenticatedUser = {
      userId: '5',
      email: 'staff@academy.edu',
      role: AdminRole.DEPARTMENT_STAFF,
      branchId,
      departmentId,
    };
    const scope = TenancyScoper.getTicketQueryScope(user);
    expect(scope.$or).toBeDefined();
    expect(scope.$or[0].branchId).toEqual(new Types.ObjectId(branchId));
    expect(scope.$or[0]['routing.assignedDepartmentId']).toEqual(new Types.ObjectId(departmentId));
  });

  it('BRANCH_DEAN without branchId should throw ForbiddenException', () => {
    const user: AuthenticatedUser = {
      userId: '6',
      email: 'dean@academy.edu',
      role: AdminRole.BRANCH_DEAN,
    };
    expect(() => TenancyScoper.getTicketQueryScope(user)).toThrow(ForbiddenException);
  });
});
