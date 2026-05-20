import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function redirectToIcon(request: NextRequest) {
  return NextResponse.redirect(new URL("/icon.svg", request.url), 307);
}

export function GET(request: NextRequest) {
  return redirectToIcon(request);
}

export function HEAD(request: NextRequest) {
  return redirectToIcon(request);
}
