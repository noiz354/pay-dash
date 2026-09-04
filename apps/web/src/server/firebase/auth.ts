import "server-only";

import { getFirebaseAdminAuth } from "./admin";

export type AuthenticatedFirebaseUser = {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
};

export class FirebaseAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "FirebaseAuthError";
    this.status = status;
  }
}

function bearerToken(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim();
}

function testUserFromToken(token: string): AuthenticatedFirebaseUser | null {
  if (process.env.NODE_ENV === "production") return null;
  if (process.env.AI_JOURNAL_ALLOW_TEST_AUTH !== "true") return null;
  if (!token.startsWith("test:")) return null;

  const raw = token.slice("test:".length).trim();
  const [uid = "test-user", email = "tester@example.com", name = "Test User"] = raw.split("|");
  return { uid, email, name };
}

export async function requireFirebaseUser(request: Request): Promise<AuthenticatedFirebaseUser> {
  const token = bearerToken(request);
  if (!token) {
    throw new FirebaseAuthError(401, "Missing Firebase ID token. Sign in with Firebase first.");
  }

  const testUser = testUserFromToken(token);
  if (testUser) return testUser;

  try {
    const decoded = await getFirebaseAdminAuth().verifyIdToken(token, true);
    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : undefined,
      name: typeof decoded.name === "string" ? decoded.name : undefined,
      picture: typeof decoded.picture === "string" ? decoded.picture : undefined,
    };
  } catch {
    throw new FirebaseAuthError(401, "Invalid or expired Firebase ID token.");
  }
}
