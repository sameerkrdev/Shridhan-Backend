export type PermissionResource = "membership" | "society" | "role" | "user" | "fixed_deposit";

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
];

export const AVAILABLE_PERMISSION_KEYS = PERMISSION_DEFINITIONS.map((permission) => permission.key);

export const PERMISSION_CATALOG = {
  resources: PERMISSION_RESOURCES,
  permissions: PERMISSION_DEFINITIONS,
};
