import { NextRequest, NextResponse } from "next/server";
import { FinalizeReq, FinalizeRes } from "../schemas";
import { createServerSdk } from "@/lib/sdk";
import z from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as z.infer<typeof FinalizeReq>;

    const validatedData = FinalizeReq.parse(body);

    const { booksApi } = createServerSdk(request);
    const resp = await booksApi.finalizeBook({
      finalizeBookDto: {
        bookId: validatedData.bookId,
      },
    });

    if (!resp.data.bookId || resp.data.status !== "ready") {
      return NextResponse.json(
        { error: "Book is not finalized or still pending." },
        { status: 400 }
      );
    }

    const response = FinalizeRes.parse({
      bookId: resp.data.bookId,
      status: resp.data.status,
    });

    const out = NextResponse.json(response, { status: resp.status });
    return out;
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
