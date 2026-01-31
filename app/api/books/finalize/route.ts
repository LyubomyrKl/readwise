import { NextRequest, NextResponse } from "next/server";
import { booksApi, axios } from "@/lib/api";
import type { FinalizeBookDto } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FinalizeBookDto;
    const resp = await booksApi.finalizeBook(body);

    if (!resp.data.bookId || resp.data.status !== "ready") {
      return NextResponse.json(
        { error: "Book is not finalized or still pending." },
        { status: 400 }
      );
    }

    return NextResponse.json(resp.data, { status: resp.status });
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
