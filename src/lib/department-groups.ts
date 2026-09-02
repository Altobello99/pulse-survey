export type DepartmentGroupDefinition = {
  id: string;
  name: string;
  departmentCodes: readonly string[];
};

export const DEPARTMENT_GROUPS: readonly DepartmentGroupDefinition[] = [
  {
    id: "production",
    name: "Production",
    departmentCodes: ["801", "802", "803", "804", "805", "807", "809"],
  },
];

export function findDepartmentGroup(id: string | null) {
  return DEPARTMENT_GROUPS.find((group) => group.id === id) || null;
}

export function departmentBelongsToGroup(
  departmentName: string,
  group: DepartmentGroupDefinition
) {
  const code = departmentName.trim().match(/^(\d{3})\b/)?.[1];
  return Boolean(code && group.departmentCodes.some((departmentCode) => departmentCode === code));
}
