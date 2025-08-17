import { NextRequest, NextResponse } from "next/server";
import { FinalizeCoverReq } from "../schemas";
import { createServerSdk } from "@/lib/sdk";
import z from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as z.infer<typeof FinalizeCoverReq>;

    const validatedData = FinalizeCoverReq.parse(body);

    const { booksApi } = createServerSdk();
    const resp = await booksApi.finalizeCover({
      finalizeCoverDto: {
        bookId: validatedData.bookId,
      },
    });

    const out = NextResponse.json(
      {
        bookId: body.bookId,
        status: "ready",
      },
      { status: resp.status }
    );

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
