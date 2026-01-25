import { NextRequest, NextResponse } from "next/server";
import { createServerSdk } from "@/lib/sdk";
import type { FinalizeBookDto } from "@satoru-satoshi/summarize-api-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FinalizeBookDto;

    const { booksApi } = createServerSdk();
    const resp = await booksApi.finalizeBook({
      finalizeBookDto: body,
    });

    if (!resp.data.bookId || resp.data.status !== "ready") {
      return NextResponse.json(
        { error: "Book is not finalized or still pending." },
        { status: 400 }
      );
    }

    return NextResponse.json(resp.data, { status: resp.status });
  } catch (error) {
    console.error("[finalize] Error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
