import { NextRequest, NextResponse } from "next/server";
import { FinalizeReq, FinalizeRes } from "../schemas";
import { booksApi } from "@/lib/sdk";
import z from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as z.infer<typeof FinalizeReq>;

    const validatedData = FinalizeReq.parse(body);

    const data = await booksApi.finalizeBook({
      finalizeBookDto: {
        bookId: validatedData.bookId,
      },
    });

    if (!data.data.bookId || data.data.status !== "ready") {
      return NextResponse.json(
        { error: "Book is not finalized or still pending." },
        { status: 400 }
      );
    }

    const response = FinalizeRes.parse({
      bookId: data.data.bookId,
      status: data.data.status,
    });

    return NextResponse.json(response);
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
