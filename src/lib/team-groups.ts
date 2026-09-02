export type TeamGroup = {
  id: string;
  name: string;
  teamIds: string[];
  sortOrder: number;
};

type TeamRecord = {
  id: string;
  name: string;
};

export function productionLineNumber(name: string | null | undefined) {
  const match = cleanTeamName(name).match(
    /\b(?:production\s*)?line\s*(?:[-/#:]?\s*)?([123])\b/i
  );
  return match ? Number(match[1]) : null;
}

export function teamGroupIdentity(name: string | null | undefined) {
  const cleanedName = cleanTeamName(name) || "Unassigned";
  const lineNumber = productionLineNumber(cleanedName);

  if (lineNumber !== null) {
    return {
      id: `production-line-${lineNumber}`,
      name: `Production Line ${lineNumber}`,
      sortOrder: lineNumber,
    };
  }

  return {
    id: `team:${cleanedName.toLowerCase()}`,
    name: cleanedName,
    sortOrder: 100,
  };
}

export function groupTeams(teams: TeamRecord[]): TeamGroup[] {
  const groups = new Map<string, TeamGroup>();

  for (const team of teams) {
    const identity = teamGroupIdentity(team.name);
    const existing = groups.get(identity.id);

    if (existing) {
      if (!existing.teamIds.includes(team.id)) existing.teamIds.push(team.id);
      continue;
    }

    groups.set(identity.id, {
      ...identity,
      teamIds: [team.id],
    });
  }

  return [...groups.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)
  );
}

export function formatShiftLine(name: string) {
  const lineNumber = productionLineNumber(name);
  if (lineNumber === null) return cleanTeamName(name);
  return lineNumber === 3 ? "Line 3 - Nights" : `Line ${lineNumber}`;
}

function cleanTeamName(name: string | null | undefined) {
  return (name || "").trim().replace(/\s+/g, " ");
}
