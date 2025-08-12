"use server";
import { cookies } from "next/headers";
import * as jose from "jose";

const issuer = process.env.JWT_ISSUER!;
const audience = process.env.JWT_AUDIENCE!;
const jwks = jose.createRemoteJWKSet(
  new URL(`${process.env.API_URL}/.well-known/jwks.json`)
);

export async function getUser() {
  const token = (await cookies()).get("access_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jose.jwtVerify(token, jwks, { issuer, audience });
    return payload as { userId: string; email: string; role?: string };
  } catch {
    return null;
  }
}
