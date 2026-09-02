// Team members + roles (ADR-0022) — the dashboard's own RBAC. INTEGRATION.md
// (:97/:122/:318) documents the team screen with no Xendit source: "Role-based
// access control is Dashboard-only." The team is a domain the app itself
// manages — the same class as webhooks (not in the SDK product list,
// app-owned) — so it is deliberately seeded: five active members on the
// merchant's own domain, one open invite. The prototype's fourth "member"
// (Elena Jenkins, status Invited) was both a member and a contradiction of
// the Pending Invites tab; here an invite is an INVITED status, listed under
// Pending Invites, not a ghost member.
//
// The app does not model a signed-in user (no session concept in this
// prototype), so the page assumes the operator holds Admin rights.

export {
  TEAM_ROLES,
  ROLE_LABELS,
  MEMBER_STATUS_LABELS,
  INVITE_TTL_DAYS,
  type TeamRole,
  type MemberStatus,
  type RoleDefinition,
} from "@/lib/team-roles";
import type { RoleDefinition, TeamRole, MemberStatus } from "@/lib/team-roles";
import { TEAM_ROLES } from "@/lib/team-roles";

export type Member = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: MemberStatus;
  joinedAt: string | null; // null until the invite is accepted
  invitedAt: string | null;
  lastActiveAt: string | null;
  notes?: string;
};

export type MemberFilters = {
  q?: string;
  role?: TeamRole | "ALL";
  /** Single status, or an explicit set (the Members tab shows ACTIVE +
   * DEACTIVATED; the Pending Invites tab shows INVITED). */
  status?: MemberStatus | "ALL";
  statuses?: MemberStatus[];
  page?: number;
  pageSize?: number;
};

export type PaginatedMembers = {
  rows: Member[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  isFiltered: boolean;
};

/* --------------------------------- seeding -------------------------------- */

function memberIdFromEmail(email: string): string {
  const key = email.trim().toLowerCase();
  let hash = 5381;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
  }
  return `mem_${hash.toString(36).padStart(8, "0")}`;
}

const DAY = 86_400_000;
const iso = (daysFromNow: number, anchor: number) => new Date(anchor + daysFromNow * DAY).toISOString();

type SeedMember = {
  name: string;
  email: string;
  role: TeamRole;
  status: MemberStatus;
  joinedDaysAgo: number | null;
  invitedDaysAgo?: number;
  lastActiveHoursAgo?: number;
};

const SEED_MEMBERS: SeedMember[] = [
  {
    name: "Daniel Wirawan",
    email: "daniel@acmecorp.com",
    role: "ADMIN",
    status: "ACTIVE",
    joinedDaysAgo: 420,
    lastActiveHoursAgo: 0.03, // ~2 minutes
  },
  {
    name: "Michael Chen",
    email: "m.chen@acmecorp.com",
    role: "DEVELOPER",
    status: "ACTIVE",
    joinedDaysAgo: 330,
    lastActiveHoursAgo: 1,
  },
  {
    name: "Sarah Anderson",
    email: "sarah.a@acmecorp.com",
    role: "ANALYST",
    status: "ACTIVE",
    joinedDaysAgo: 240,
    lastActiveHoursAgo: 3,
  },
  {
    name: "Priya Nair",
    email: "priya@acmecorp.com",
    role: "DEVELOPER",
    status: "ACTIVE",
    joinedDaysAgo: 150,
    lastActiveHoursAgo: 26,
  },
  {
    name: "Kevin Halim",
    email: "kevin@acmecorp.com",
    role: "ANALYST",
    status: "ACTIVE",
    joinedDaysAgo: 300,
    lastActiveHoursAgo: 24 * 9,
  },
  {
    name: "Elena Jenkins",
    email: "elena.j@acmecorp.com",
    role: "RISK_ANALYST",
    status: "INVITED",
    joinedDaysAgo: null,
    invitedDaysAgo: 3,
  },
];

function seedMembers(): Member[] {
  const anchor = Date.now();
  return SEED_MEMBERS.map((m) => ({
    id: memberIdFromEmail(m.email),
    name: m.name,
    email: m.email,
    role: m.role,
    status: m.status,
    joinedAt: m.joinedDaysAgo === null ? null : iso(-m.joinedDaysAgo, anchor),
    invitedAt: m.invitedDaysAgo === undefined ? null : iso(-m.invitedDaysAgo, anchor),
    lastActiveAt:
      m.lastActiveHoursAgo === undefined ? null : new Date(anchor - m.lastActiveHoursAgo * 3_600_000).toISOString(),
    notes: "Seeded for the prototype team directory.",
  }));
}

/* ---------------------------------- store ---------------------------------- */

type Store = { members: Member[] };

const globalStore = globalThis as unknown as { __kineticTeamStore?: Store };
function store(): Store {
  if (!globalStore.__kineticTeamStore) {
    globalStore.__kineticTeamStore = { members: seedMembers() };
  }
  return globalStore.__kineticTeamStore;
}

/* ----------------------------------- api ------------------------------------ */

export async function listMembers(filters: MemberFilters = {}): Promise<PaginatedMembers> {
  const { q = "", role = "ALL", status = "ALL" } = filters;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(5, filters.pageSize ?? 10));
  const needle = q.trim().toLowerCase();

  const statusSet =
    filters.statuses !== null && filters.statuses !== undefined
      ? new Set(filters.statuses)
      : status !== "ALL"
        ? new Set<MemberStatus>([status])
        : new Set<MemberStatus>(["ACTIVE", "INVITED", "DEACTIVATED"]);
  const filtered = store().members.filter((m) => {
    if (role !== "ALL" && m.role !== role) return false;
    if (!statusSet.has(m.status)) return false;
    if (needle) {
      const hay = `${m.id} ${m.name} ${m.email}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  // Active first, then invited, then deactivated; most recently active first.
  const rank: Record<MemberStatus, number> = { ACTIVE: 0, INVITED: 1, DEACTIVATED: 2 };
  filtered.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    const aAt = a.lastActiveAt ?? a.invitedAt ?? a.joinedAt ?? "";
    const bAt = b.lastActiveAt ?? b.invitedAt ?? b.joinedAt ?? "";
    return bAt.localeCompare(aAt);
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount);
  return {
    rows: filtered.slice((safePage - 1) * pageSize, safePage * pageSize),
    total: filtered.length,
    page: safePage,
    pageSize,
    pageCount,
    isFiltered:
      needle.length > 0 || role !== "ALL" || (filters.statuses?.length ?? 0) > 0 || status !== "ALL",
  };
}

export async function getMember(id: string): Promise<Member | null> {
  return store().members.find((m) => m.id === id) ?? null;
}

export type InviteMemberInput = { name: string; email: string; role: TeamRole };

// Invites are the app's own outbound record: INVITED until accepted. The
// prototype never said when the invite was sent or that it expires — now it
// does (INVITE_TTL_DAYS, stated on the page).
export async function inviteMember(input: InviteMemberInput): Promise<Member> {
  const now = new Date().toISOString();
  const member: Member = {
    id: memberIdFromEmail(input.email) + new Date().getTime().toString(36),
    name: input.name,
    email: input.email,
    role: input.role,
    status: "INVITED",
    joinedAt: null,
    invitedAt: now,
    lastActiveAt: null,
  };
  store().members = [member, ...store().members];
  return member;
}

export async function changeMemberRole(id: string, role: TeamRole): Promise<Member | null> {
  const member = store().members.find((m) => m.id === id);
  if (!member) return null;
  member.role = role;
  return member;
}

export async function deactivateMember(id: string): Promise<Member | null> {
  const member = store().members.find((m) => m.id === id);
  if (!member) return null;
  member.status = "DEACTIVATED";
  return member;
}

export async function reactivateMember(id: string): Promise<Member | null> {
  const member = store().members.find((m) => m.id === id);
  if (!member) return null;
  member.status = "ACTIVE";
  if (!member.joinedAt) member.joinedAt = new Date().toISOString();
  member.invitedAt = null;
  return member;
}

export async function resendInvite(id: string): Promise<Member | null> {
  const member = store().members.find((m) => m.id === id);
  if (!member || member.status !== "INVITED") return null;
  member.invitedAt = new Date().toISOString();
  return member;
}

export async function revokeInvite(id: string): Promise<boolean> {
  const before = store().members.length;
  store().members = store().members.filter((m) => !(m.id === id && m.status === "INVITED"));
  return store().members.length < before;
}

/** Role catalog with member counts derived from the store (Roles tab). */
export async function roleCatalog(): Promise<(RoleDefinition & { members: number })[]> {
  const all = store().members;
  return TEAM_ROLES.map((r) => ({
    ...r,
    members: all.filter((m) => m.role === r.value && m.status === "ACTIVE").length,
  }));
}

/* ----------------------------------- csv ------------------------------------ */

export function membersToCsv(rows: Member[]): string {
  const header = ["id", "name", "email", "role", "status", "joined_at", "invited_at", "last_active_at"];
  const cell = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = rows.map((m) =>
    [m.id, m.name, m.email, m.role, m.status, m.joinedAt, m.invitedAt, m.lastActiveAt].map(cell).join(",")
  );
  return [header.join(","), ...body].join("\n");
}
