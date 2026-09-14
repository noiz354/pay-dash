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

import "server-only";

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
import { DEFAULT_DEMO_ORG } from "@/domain/payments/runtime-defaults";
import { parseOrganizationContext, type OrganizationContext } from "@/domain/tenancy/organization-context";
import { TenantIsolationError } from "@/domain/security/tenant";
import { recordTenantDenial } from "@/server/services/tenant-denial";

export type Member = {
  id: string;
  /**
   * Wave 7F — the owning tenant. Membership *is* the tenant edge (spec P-10):
   * a role grant here authorises nothing in any other organization, so the row
   * carries its owner and every read/write below is partition-bound.
   */
  organizationId: string;
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

/**
 * The invite id suffix. Unique per mint rather than per millisecond: the email
 * hash in front of it is a pure global function, so two tenants inviting the
 * same person in the same tick would otherwise mint the *same* id — and inside
 * one partition, two invites in a bulk add would collide outright.
 */
let inviteSeq = 0;
function inviteSuffix(): string {
  inviteSeq += 1;
  return `${Date.now().toString(36)}${inviteSeq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function seedMembers(organizationId: string): Member[] {
  const anchor = Date.now();
  return SEED_MEMBERS.map((m) => ({
    id: memberIdFromEmail(m.email),
    organizationId,
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

type TenantTeamState = { members: Member[] };
type Store = { tenants: Map<string, TenantTeamState> };

const globalStore = globalThis as unknown as { __kineticTeamStore?: Store };
function store(): Store {
  if (!globalStore.__kineticTeamStore) {
    // The prototype roster is the *demo* tenant's team, seeded eagerly so a
    // first read renders the seeded world (the 7C/7D seed rule). Every other
    // tenant starts empty and gains members through `inviteMember(ctx, …)`.
    globalStore.__kineticTeamStore = {
      tenants: new Map<string, TenantTeamState>([[DEFAULT_DEMO_ORG, { members: seedMembers(DEFAULT_DEMO_ORG) }]]),
    };
  }
  return globalStore.__kineticTeamStore;
}

/* --------------------------- tenancy seam helpers -------------------------- */

/**
 * Validate the caller's context at the boundary. `parseOrganizationContext` is
 * the only constructor, so a malformed or missing ctx throws here rather than
 * becoming "the demo tenant" (contract C-1/C-2).
 */
function scopeOf(ctx: OrganizationContext): OrganizationContext {
  return parseOrganizationContext(ctx);
}

/** The caller's roster. Never materialises a partition, so a read cannot invent a tenant. */
function readPartition(organizationId: string): TenantTeamState {
  return store().tenants.get(organizationId) ?? { members: [] };
}

/** The caller's roster, materialised for a write. */
function writePartition(organizationId: string): TenantTeamState {
  const s = store();
  let partition = s.tenants.get(organizationId);
  if (!partition) {
    partition = { members: [] };
    s.tenants.set(organizationId, partition);
  }
  return partition;
}

/**
 * How many tenants hold members. Tenancy *probe*: answers a question about the
 * store, never a member — which is why it, and not a repository read, is what
 * the quarantine gate and the seam's demo-fallback refusal gate on.
 */
export function countTeamTenants(): number {
  let count = 0;
  for (const [, t] of store().tenants.entries()) {
    if (t.members.length > 0) count += 1;
  }
  return count;
}

/**
 * The identity of the only member-holding tenant, or `null` when there is not
 * exactly one. Row-free by design (7C/7D precedent): the quarantine fails closed
 * on `> 1` and the demo fallback is refused in the same condition.
 */
export function soleTeamOrganizationId(): string | null {
  const ids: string[] = [];
  for (const [id, t] of store().tenants.entries()) {
    if (t.members.length > 0) ids.push(id);
  }
  return ids.length === 1 ? (ids[0] ?? null) : null;
}

/**
 * Which other tenant (if any) holds a member with this id.
 *
 * The team store is this module's own, so attribution is exact rather than
 * bounded (contrast 7D's ledger-derived invoices, where naming an owner would
 * have needed a 7A enumerator that does not exist). Returns an org id only —
 * never a name, email or role — and is consulted *after* the caller's own
 * partition has answered `null`, so it cannot widen a read.
 */
function memberOwnedByAnotherTenant(organizationId: string, id: string): string | null {
  for (const [tenantId, state] of store().tenants.entries()) {
    if (tenantId === organizationId) continue;
    if (state.members.some((m) => m.id === id)) return tenantId;
  }
  return null;
}

/**
 * Refuse a write on another tenant's member: audited, then thrown. The wire
 * answer is the caller's uniform not-found string (mapped in the action), so
 * "not yours" and "does not exist" stay indistinguishable — while the denial
 * sink keeps the asymmetry for operators (contract C-4/C-5).
 */
function refuseForeignMember(surface: string, organizationId: string, id: string): never {
  const foreignOwner = memberOwnedByAnotherTenant(organizationId, id);
  if (foreignOwner) {
    recordTenantDenial({
      surface,
      actorOrganizationId: organizationId,
      requestedOrganizationId: foreignOwner,
      actorId: null,
      resourceId: typeof id === "string" ? id : null,
    });
    throw new TenantIsolationError(
      "CROSS_TENANT_WRITE",
      { surface, actorOrg: organizationId, requestedOrg: foreignOwner },
      `Refusing a cross-tenant write on ${surface}: the member belongs to another organization.`,
    );
  }
  // Nobody owns it: an unknown id, answered by the caller's `null`/`false` path.
  throw new UnknownMemberError();
}

/** Internal signal: the id exists in no tenant, so the caller answers not-found. */
class UnknownMemberError extends Error {
  constructor() {
    super("member not found");
    this.name = "UnknownMemberError";
  }
}

/**
 * Resolve a member for a mutation: the caller's own row, or a refusal. Order is
 * the contract (spec F-13): the tenant is resolved and the row is looked up
 * *inside* the caller's partition before any role, status or timestamp is
 * examined or written.
 */
function ownedMemberForWrite(surface: string, organizationId: string, id: string): Member {
  const member = readPartition(organizationId).members.find((m) => m.id === id);
  if (member) return member;
  return refuseForeignMember(surface, organizationId, id);
}

/* ----------------------------------- api ------------------------------------ */

export async function listMembers(
  ctx: OrganizationContext,
  filters: MemberFilters = {},
): Promise<PaginatedMembers> {
  const { organizationId } = scopeOf(ctx);
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
  // The predicate is the partition: role/status/needle/pagination below only
  // ever see the caller's roster, so no filter can widen the answer.
  const filtered = readPartition(organizationId).members.filter((m) => {
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

export async function getMember(ctx: OrganizationContext, id: string): Promise<Member | null> {
  const { organizationId } = scopeOf(ctx);
  // A foreign id and a missing id answer identically: `null` (contract C-5), so
  // the detail path is not an enumeration oracle.
  return readPartition(organizationId).members.find((m) => m.id === id) ?? null;
}

export type InviteMemberInput = { name: string; email: string; role: TeamRole };

// Invites are the app's own outbound record: INVITED until accepted. The
// prototype never said when the invite was sent or that it expires — now it
// does (INVITE_TTL_DAYS, stated on the page).
//
// Wave 7F: an invite binds a person to the *caller's* organization and to
// nothing else — there is no cross-org invite, and the input carries no tenant
// field to smuggle one in (spec P-10).
export async function inviteMember(ctx: OrganizationContext, input: InviteMemberInput): Promise<Member> {
  const { organizationId } = scopeOf(ctx);
  const now = new Date().toISOString();
  const member: Member = {
    id: memberIdFromEmail(input.email) + inviteSuffix(),
    organizationId,
    name: input.name,
    email: input.email,
    role: input.role,
    status: "INVITED",
    joinedAt: null,
    invitedAt: now,
    lastActiveAt: null,
  };
  const partition = writePartition(organizationId);
  partition.members = [member, ...partition.members];
  return member;
}

/**
 * Re-role a member. This is the slice's privilege-escalation edge, so the order
 * is the contract (spec F-13, 7B M8 / 7D B-13 precedent): resolve the tenant →
 * look the member up *inside* it → refuse a foreign id loudly (audited) → only
 * then examine or write the role. A cross-tenant re-role is not a display bug.
 */
export async function changeMemberRole(
  ctx: OrganizationContext,
  id: string,
  role: TeamRole,
): Promise<Member | null> {
  // F-13 order pin: tenant → row → role. Nothing about the role is examined,
  // and no write happens, until the member is known to be the caller's own.
  const { organizationId } = scopeOf(ctx);
  const member = readPartition(organizationId).members.find((m) => m.id === id);
  if (!member) {
    // Not in the caller's roster. Two very different facts, one wire answer:
    //   • nobody holds this id  → `null`, exactly like any unknown member;
    //   • *another tenant* holds it → a privilege-escalation attempt (re-role
    //     somebody else's Admin), so it is attributed, audited and refused
    //     loudly. A quiet `null` here would hide the only signal that a client
    //     is probing foreign member ids.
    const foreignOwner = memberOwnedByAnotherTenant(organizationId, id);
    if (foreignOwner) {
      recordTenantDenial({
        surface: "server/data/team.changeMemberRole",
        actorOrganizationId: organizationId,
        requestedOrganizationId: foreignOwner,
        actorId: null,
        resourceId: id,
      });
      throw new TenantIsolationError(
        "CROSS_TENANT_WRITE",
        { surface: "server/data/team.changeMemberRole", actorOrg: organizationId, requestedOrg: foreignOwner },
        "Refusing a cross-tenant role change on server/data/team.changeMemberRole: the member belongs to another organization.",
      );
    }
    return null;
  }
  member.role = role;
  return member;
}

export async function deactivateMember(ctx: OrganizationContext, id: string): Promise<Member | null> {
  const { organizationId } = scopeOf(ctx);
  let member: Member;
  try {
    member = ownedMemberForWrite("server/data/team.deactivateMember", organizationId, id);
  } catch (e) {
    if (e instanceof UnknownMemberError) return null;
    throw e;
  }
  member.status = "DEACTIVATED";
  return member;
}

export async function reactivateMember(ctx: OrganizationContext, id: string): Promise<Member | null> {
  const { organizationId } = scopeOf(ctx);
  let member: Member;
  try {
    member = ownedMemberForWrite("server/data/team.reactivateMember", organizationId, id);
  } catch (e) {
    if (e instanceof UnknownMemberError) return null;
    throw e;
  }
  member.status = "ACTIVE";
  if (!member.joinedAt) member.joinedAt = new Date().toISOString();
  member.invitedAt = null;
  return member;
}

export async function resendInvite(ctx: OrganizationContext, id: string): Promise<Member | null> {
  const { organizationId } = scopeOf(ctx);
  let member: Member;
  try {
    member = ownedMemberForWrite("server/data/team.resendInvite", organizationId, id);
  } catch (e) {
    if (e instanceof UnknownMemberError) return null;
    throw e;
  }
  if (member.status !== "INVITED") return null;
  member.invitedAt = new Date().toISOString();
  return member;
}

/**
 * Revoke an invite — a destructive write, so a foreign id is refused (audited)
 * rather than answered `false`: `false` means "there was nothing to revoke in
 * *your* team", never "someone else's invite is safe".
 */
export async function revokeInvite(ctx: OrganizationContext, id: string): Promise<boolean> {
  const { organizationId } = scopeOf(ctx);
  const partition = writePartition(organizationId);
  const target = partition.members.find((m) => m.id === id);
  if (!target) {
    try {
      refuseForeignMember("server/data/team.revokeInvite", organizationId, id);
    } catch (e) {
      if (e instanceof UnknownMemberError) return false;
      throw e;
    }
  }
  if (target!.status !== "INVITED") return false;
  const before = partition.members.length;
  partition.members = partition.members.filter((m) => !(m.id === id && m.status === "INVITED"));
  return partition.members.length < before;
}

/** Role catalog with member counts derived from the caller's roster (Roles tab). */
export async function roleCatalog(ctx: OrganizationContext): Promise<(RoleDefinition & { members: number })[]> {
  const { organizationId } = scopeOf(ctx);
  const all = readPartition(organizationId).members;
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
