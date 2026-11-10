
export enum AdminRole {
  SUPER_ADMIN = 'SUPER_ADMIN', //مسؤول النظام

  CENTRAL_COMPLAINTS_OFFICER =
    ' مسؤول الشكاوى في الفرع الرئيسي', //مسؤول الشكاوي في الفرع الرئيسي

  CENTRAL_DEPARTMENT_STAFF =
    'موظف في الفرع الرئيسي', // الاقسام الفرع الرئيسي

  ACADEMY_PRESIDENT = 'رئيس الاكاديمة', // مكتب العميد الرئيسي للاكاديمية

  BRANCH_MANAGER = 'عميد الفرع', //عميد الفرع

  BRANCH_STAFF = 'مسؤول شكاوي الفرع',//مسؤول الشكاوي في الفرع
}
