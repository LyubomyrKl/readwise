import { NextRequest, NextResponse } from "next/server";
import { createServerSdk } from "@/lib/sdk";
import { z } from "zod";

const UpdateCoverFinalizeReq = z.object({
  bookId: z.string(),
  storageKey: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = UpdateCoverFinalizeReq.parse(body);

    const { booksApi } = createServerSdk();

    const resp = await booksApi.updateCoverFinalize({
      coverUpdateDto: {
        bookId: validatedData.bookId,
        storageKey: validatedData.storageKey,
      },
    });

    const out = NextResponse.json(
      {
        bookId: validatedData.bookId,
        status: "ready",
      },
      { status: resp.status }
    );

    return out;
  } catch (error) {
    console.error("Update cover finalize error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
