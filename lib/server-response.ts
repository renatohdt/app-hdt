import { NextResponse } from "next/server";

export function jsonSuccess(data?: unknown, status = 200) {
  return NextResponse.json(
    {
      success: true,
      data: data ?? null
    },
    {
      status
    }
  );
}

export function jsonError(error: string, status = 500) {
  return NextResponse.json(
    {
      success: false,
      error
    },
    {
      status
    }
  );
}
