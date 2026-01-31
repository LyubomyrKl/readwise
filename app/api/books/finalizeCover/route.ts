import { NextRequest, NextResponse } from "next/server";
import { booksApi, axios } from "@/lib/api";
import type { FinalizeCoverDto } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FinalizeCoverDto;
    const resp = await booksApi.finalizeCover(body);

    return NextResponse.json(
      {
        bookId: body.bookId,
        status: "ready",
      },
      { status: resp.status }
    );
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, {
        status: error.response.status,
      });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
