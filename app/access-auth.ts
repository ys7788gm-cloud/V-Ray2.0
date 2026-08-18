import { cookies } from "next/headers";

export const ACCESS_COOKIE_NAME = "vray_access";
export const ACCESS_COOKIE_MAX_AGE = 60 * 60 * 8;

const encoder = new TextEncoder();

function secret(name: "VRAY_ACCESS_PASSWORD" | "VRAY_SESSION_SECRET"): string {
  return process.env[name]?.trim() ?? "";
}

async function digest(value: string): Promise<Uint8Array> {
  const result = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return new Uint8Array(result);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < length; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

export async function verifyAccessPassword(candidate: string): Promise<boolean> {
  const expected = secret("VRAY_ACCESS_PASSWORD");
  if (!expected || !candidate) return false;

  const [candidateDigest, expectedDigest] = await Promise.all([
    digest(candidate),
    digest(expected),
  ]);
  return constantTimeEqual(candidateDigest, expectedDigest);
}

export async function accessSessionToken(): Promise<string | null> {
  const sessionSecret = secret("VRAY_SESSION_SECRET");
  if (!sessionSecret) return null;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(sessionSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode("vray-2.0-access-v1"),
  );
  return `v1.${base64Url(new Uint8Array(signature))}`;
}

export async function hasValidAccess(): Promise<boolean> {
  const expected = await accessSessionToken();
  if (!expected) return false;

  const cookieStore = await cookies();
  const supplied = cookieStore.get(ACCESS_COOKIE_NAME)?.value;
  if (!supplied) return false;

  const [suppliedDigest, expectedDigest] = await Promise.all([
    digest(supplied),
    digest(expected),
  ]);
  return constantTimeEqual(suppliedDigest, expectedDigest);
}
