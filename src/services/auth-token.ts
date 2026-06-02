export type OrganizationRole = "SUPER_USER" | "MEMBER" | "VIEWER";
export type ParticipantRole = "SUPPLIER" | "BUYER" | "INVESTOR" | "OPERATOR";

export type AuthContext = {
  userId: string;
  participantRole: ParticipantRole;
  organizationRole: OrganizationRole;
  accessToken?: string;
};

const tokenPattern = /^test:([^:]+):([^:]+):([^:]+)$/;
const participantRoles = new Set<ParticipantRole>(["SUPPLIER", "BUYER", "INVESTOR", "OPERATOR"]);
const organizationRoles = new Set<OrganizationRole>(["SUPER_USER", "MEMBER", "VIEWER"]);

export function parseAuthToken(token: string): AuthContext | null {
  const match = token.match(tokenPattern);
  if (!match) return null;

  const [, userId, participantRole, organizationRole] = match;
  if (!userId || userId === "expired") return null;
  if (!participantRoles.has(participantRole as ParticipantRole)) return null;
  if (!organizationRoles.has(organizationRole as OrganizationRole)) return null;

  return {
    userId,
    participantRole: participantRole as ParticipantRole,
    organizationRole: organizationRole as OrganizationRole
  };
}
