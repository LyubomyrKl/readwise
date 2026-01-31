import { NextRequest, NextResponse } from "next/server";
import { booksApi, axios } from "@/lib/api";
import type { CoverUpdateDto } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CoverUpdateDto;
    const resp = await booksApi.updateCoverFinalize(body);

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
