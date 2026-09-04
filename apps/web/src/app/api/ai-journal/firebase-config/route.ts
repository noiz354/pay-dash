const publicFirebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const required = [
  ["NEXT_PUBLIC_FIREBASE_API_KEY", publicFirebaseConfig.apiKey],
  ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", publicFirebaseConfig.authDomain],
  ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", publicFirebaseConfig.projectId],
  ["NEXT_PUBLIC_FIREBASE_APP_ID", publicFirebaseConfig.appId],
] as const;

export const dynamic = "force-dynamic";

export function GET() {
  const missing = required.filter(([, value]) => !value).map(([key]) => key);

  return Response.json({
    configured: missing.length === 0,
    missing,
    config: missing.length === 0 ? publicFirebaseConfig : null,
  });
}
