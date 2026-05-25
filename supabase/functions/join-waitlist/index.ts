import { createClient } from "npm:@supabase/supabase-js@2";

type SignupRequest = {
  email?: unknown;
  source?: unknown;
  marketingConsent?: unknown;
  company?: unknown;
  turnstileToken?: unknown;
};

type TurnstileResult = {
  success: boolean;
  hostname?: string;
  action?: string;
  "error-codes"?: string[];
};

const allowedSources = new Set(["hero", "waitlist", "final"]);
const allowedOrigins = csvEnv("ALLOWED_ORIGINS");
const allowedHostnames = csvEnv("ALLOWED_TURNSTILE_HOSTNAMES");
const turnstileSecret = requiredEnv("TURNSTILE_SECRET_KEY");
const supabaseUrl = requiredEnv("SUPABASE_URL");
const databaseSecretKey = getDatabaseSecretKey();

const database = createClient(supabaseUrl, databaseSecretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(async (request) => {
  const origin = request.headers.get("origin") || "";
  const corsHeaders = corsForOrigin(origin);

  if (request.method === "OPTIONS") {
    return allowedOrigins.has(origin)
      ? new Response("ok", { headers: corsHeaders })
      : json({ error: "Origin not allowed." }, 403);
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed." }, 405, corsHeaders);
  }

  if (!allowedOrigins.has(origin)) {
    return json({ error: "Origin not allowed." }, 403);
  }

  let payload: SignupRequest;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400, corsHeaders);
  }

  // Silently accept honeypot submissions without persisting them.
  if (typeof payload.company === "string" && payload.company.trim()) {
    return json({ ok: true }, 201, corsHeaders);
  }

  const email = normalizeEmail(payload.email);
  const source = typeof payload.source === "string" ? payload.source : "";
  const token = typeof payload.turnstileToken === "string"
    ? payload.turnstileToken
    : "";

  if (!email || !allowedSources.has(source) || payload.marketingConsent !== true) {
    return json({ error: "Invalid signup details." }, 400, corsHeaders);
  }

  if (!token || token.length > 2048) {
    return json({ error: "Verification is required." }, 400, corsHeaders);
  }

  const verification = await verifyTurnstile(token, request);
  if (
    !verification.success ||
    verification.action !== "join_waitlist" ||
    !verification.hostname ||
    !allowedHostnames.has(verification.hostname)
  ) {
    console.warn("Rejected Turnstile verification.", verification["error-codes"] || []);
    return json({ error: "Verification failed." }, 400, corsHeaders);
  }

  const { error } = await database
    .from("waitlist_signups")
    .upsert(
      { email, source, marketing_consent: true },
      { onConflict: "email", ignoreDuplicates: true },
    );

  if (error) {
    console.error("Unable to insert waitlist signup.", error.code);
    return json({ error: "Unable to save signup." }, 500, corsHeaders);
  }

  // Duplicate and new emails receive the same response to avoid disclosing signups.
  return json({ ok: true }, 201, corsHeaders);
});

async function verifyTurnstile(
  token: string,
  request: Request,
): Promise<TurnstileResult> {
  const formData = new FormData();
  formData.append("secret", turnstileSecret);
  formData.append("response", token);

  const remoteIp = request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (remoteIp) formData.append("remoteip", remoteIp);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: formData, signal: AbortSignal.timeout(10000) },
    );
    return await response.json() as TurnstileResult;
  } catch {
    return { success: false, "error-codes": ["verification-unavailable"] };
  }
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  const pattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
  return email.length <= 254 && pattern.test(email) ? email : null;
}

function csvEnv(name: string): Set<string> {
  const value = requiredEnv(name);
  return new Set(
    value.split(",").map((item) => item.trim()).filter(Boolean),
  );
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing ${name} secret.`);
  return value;
}

function getDatabaseSecretKey(): string {
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (secretKeysJson) {
    const secretKeys = JSON.parse(secretKeysJson) as Record<string, string>;
    if (secretKeys.default) return secretKeys.default;
  }

  const legacyKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacyKey) return legacyKey;

  throw new Error("Missing a Supabase server-side secret key.");
}

function corsForOrigin(origin: string): HeadersInit {
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(
  body: Record<string, unknown>,
  status: number,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
