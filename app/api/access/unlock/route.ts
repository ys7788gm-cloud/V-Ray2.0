import { NextResponse } from "next/server";

import {
  ACCESS_COOKIE_MAX_AGE,
  ACCESS_COOKIE_NAME,
  accessSessionToken,
  verifyAccessPassword,
} from "../../../access-auth";

export async function POST(request: Request) {
  let password = "";

  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!(await verifyAccessPassword(password))) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const token = await accessSessionToken();
  if (!token) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: ACCESS_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: true,
    sameSite: "strict",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  return response;
}
