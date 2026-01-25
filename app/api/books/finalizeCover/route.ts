import { NextRequest, NextResponse } from "next/server";
import { createServerSdk } from "@/lib/sdk";
import type { FinalizeCoverDto } from "@satoru-satoshi/summarize-api-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FinalizeCoverDto;

    const { booksApi } = createServerSdk();
    const resp = await booksApi.finalizeCover({
      finalizeCoverDto: body,
    });

    return NextResponse.json(
      {
        bookId: body.bookId,
        status: "ready",
      },
      { status: resp.status }
    );
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
