export type PermissionResource =
  | "membership"
  | "society"
  | "role"
  | "user"
  | "fixed_deposit"
  | "mis"
  | "recurring_deposit";

export interface PermissionResourceMeta {
  key: PermissionResource;
  label: string;
  description: string;
}

export interface PermissionMeta {
  key: string;
  resource: PermissionResource;
  action: string;
  label: string;
  description: string;
}

export const PERMISSION_RESOURCES: PermissionResourceMeta[] = [
  {
    key: "membership",
    label: "Member Management",
    description: "Manage society members and their access levels.",
  },
  {
    key: "society",
    label: "Society Management",
    description: "View and update society-level details.",
  },
  {
    key: "role",
    label: "Access Level Management",
    description: "Create and manage society access levels.",
  },
  {
    key: "user",
    label: "Profile",
    description: "Update personal profile details.",
  },
  {
    key: "fixed_deposit",
    label: "Fixed Deposit Management",
    description: "Manage fixed deposit plans, accounts, and transactions.",
  },
  {
    key: "mis",
    label: "Monthly Interest Scheme Management",
    description: "Manage MIS project types, accounts, deposits, interest payouts, and closure.",
  },
  {
    key: "recurring_deposit",
    label: "Recurring Deposit Management",
    description: "Manage RD project types, accounts, installments, payments, and maturity withdrawal.",
  },
];

export const PERMISSION_DEFINITIONS: PermissionMeta[] = [
  {
    key: "membership.create",
    resource: "membership",
    action: "create",
    label: "Add Members",
    description: "Add an existing or new user to the society.",
  },
  {
    key: "membership.read",
    resource: "membership",
    action: "read",
    label: "View Member",
    description: "View member details.",
  },
  {
    key: "membership.list",
    resource: "membership",
    action: "list",
    label: "View Members",
    description: "View the full list of society members.",
  },
  {
    key: "membership.update_role",
    resource: "membership",
    action: "update_role",
    label: "Change Access Level",
    description: "Change a member's access level.",
  },
  {
    key: "membership.update_status",
    resource: "membership",
    action: "update_status",
    label: "Suspend or Activate Members",
    description: "Suspend or reactivate member access.",
  },
  {
    key: "membership.remove",
    resource: "membership",
    action: "remove",
    label: "Remove Members",
    description: "Remove members from the society.",
  },
  {
    key: "society.read",
    resource: "society",
    action: "read",
    label: "View Society",
    description: "View society information and settings.",
  },
  {
    key: "society.update",
    resource: "society",
    action: "update",
    label: "Edit Society Information",
    description: "Update editable society information.",
  },
  {
    key: "role.create",
    resource: "role",
    action: "create",
    label: "Create Access Levels",
    description: "Create new society access levels.",
  },
  {
    key: "role.read",
    resource: "role",
    action: "read",
    label: "View Access Levels",
    description: "View access levels and permission sets.",
  },
  {
    key: "role.update_permissions",
    resource: "role",
    action: "update_permissions",
    label: "Edit Access Level Permissions",
    description: "Update permissions for existing access levels.",
  },
  {
    key: "role.delete",
    resource: "role",
    action: "delete",
    label: "Delete Access Levels",
    description: "Delete custom access levels.",
  },
  {
    key: "user.update_self_only",
    resource: "user",
    action: "update_self_only",
    label: "Edit Own Profile",
    description: "Update your own name, phone, or avatar.",
  },
  {
    key: "fixed_deposit.create",
    resource: "fixed_deposit",
    action: "create",
    label: "Create Fixed Deposits",
    description: "Create fixed deposit project types and fixed deposit accounts.",
  },
  {
    key: "fixed_deposit.read",
    resource: "fixed_deposit",
    action: "read",
    label: "View Fixed Deposit",
    description: "View details of a fixed deposit account.",
  },
  {
    key: "fixed_deposit.list",
    resource: "fixed_deposit",
    action: "list",
    label: "View Fixed Deposits",
    description: "View all fixed deposit accounts and project types in the society.",
  },
  {
    key: "fixed_deposit.add_transaction",
    resource: "fixed_deposit",
    action: "add_transaction",
    label: "Add Fixed Deposit Transactions",
    description: "Record new transactions for fixed deposit accounts.",
  },
  {
    key: "fixed_deposit.update_status",
    resource: "fixed_deposit",
    action: "update_status",
    label: "Update Fixed Deposit Status",
    description: "Change status of fixed deposit accounts.",
  },
  {
    key: "fixed_deposit.remove",
    resource: "fixed_deposit",
    action: "remove",
    label: "Remove Fixed Deposit Accounts",
    description: "Soft delete fixed deposit accounts.",
  },
  {
    key: "fixed_deposit.remove_project_type",
    resource: "fixed_deposit",
    action: "remove_project_type",
    label: "Remove Fixed Deposit Project Types",
    description: "Soft delete fixed deposit project types.",
  },
  {
    key: "mis.create",
    resource: "mis",
    action: "create",
    label: "Create MIS Accounts",
    description: "Create MIS project types and MIS accounts.",
  },
  {
    key: "mis.read",
    resource: "mis",
    action: "read",
    label: "View MIS Account",
    description: "View details of an MIS account.",
  },
  {
    key: "mis.list",
    resource: "mis",
    action: "list",
    label: "View MIS Accounts",
    description: "View all MIS accounts and project types in the society.",
  },
  {
    key: "mis.deposit",
    resource: "mis",
    action: "deposit",
    label: "Record MIS Deposits",
    description: "Record split or full MIS deposit transactions.",
  },
  {
    key: "mis.pay_interest",
    resource: "mis",
    action: "pay_interest",
    label: "Record MIS Interest Payouts",
    description: "Record monthly interest payouts for MIS accounts.",
  },
  {
    key: "mis.return_principal",
    resource: "mis",
    action: "return_principal",
    label: "Return MIS Principal",
    description: "Return principal amount on MIS maturity and close account.",
  },
  {
    key: "mis.update_status",
    resource: "mis",
    action: "update_status",
    label: "Update MIS Status",
    description: "Manually update MIS account status where allowed.",
  },
  {
    key: "mis.remove",
    resource: "mis",
    action: "remove",
    label: "Remove MIS Accounts",
    description: "Soft delete MIS accounts.",
  },
  {
    key: "mis.remove_project_type",
    resource: "mis",
    action: "remove_project_type",
    label: "Remove MIS Project Types",
    description: "Soft delete MIS project types.",
  },
  {
    key: "recurring_deposit.create",
    resource: "recurring_deposit",
    action: "create",
    label: "Create RD Accounts",
    description: "Create RD project types and RD accounts.",
  },
  {
    key: "recurring_deposit.read",
    resource: "recurring_deposit",
    action: "read",
    label: "View RD Account",
    description: "View details of an RD account.",
  },
  {
    key: "recurring_deposit.list",
    resource: "recurring_deposit",
    action: "list",
    label: "View RD Accounts",
    description: "View all RD accounts and project types in the society.",
  },
  {
    key: "recurring_deposit.pay",
    resource: "recurring_deposit",
    action: "pay",
    label: "Record RD Payments",
    description: "Preview and record installment payments for RD accounts.",
  },
  {
    key: "recurring_deposit.pay_skip_fine",
    resource: "recurring_deposit",
    action: "pay_skip_fine",
    label: "Skip RD Fine During Payment",
    description: "Allow deferring installment penalties for maturity-time deduction.",
  },
  {
    key: "recurring_deposit.request_fine_waive",
    resource: "recurring_deposit",
    action: "request_fine_waive",
    label: "Request RD Fine Waive-Off",
    description: "Create fine waive-off requests for RD payments.",
  },
  {
    key: "recurring_deposit.approve_fine_waive",
    resource: "recurring_deposit",
    action: "approve_fine_waive",
    label: "Approve RD Fine Waive-Off",
    description: "Approve or reject RD fine waive-off requests.",
  },
  {
    key: "recurring_deposit.withdraw",
    resource: "recurring_deposit",
    action: "withdraw",
    label: "RD Maturity Withdrawal",
    description: "Withdraw maturity amount after all installments are paid.",
  },
  {
    key: "recurring_deposit.remove",
    resource: "recurring_deposit",
    action: "remove",
    label: "Remove RD Accounts",
    description: "Soft delete RD accounts.",
  },
  {
    key: "recurring_deposit.remove_project_type",
    resource: "recurring_deposit",
    action: "remove_project_type",
    label: "Remove RD Project Types",
    description: "Soft delete RD project types.",
  },
];

export const AVAILABLE_PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((permission) => permission.key);

export const PERMISSION_CATALOG = {
  resources: PERMISSION_RESOURCES,
  permissions: PERMISSION_DEFINITIONS,
};
