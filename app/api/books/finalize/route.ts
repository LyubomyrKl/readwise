import {NextRequest, NextResponse} from "next/server";
import {FinalizeReq, FinalizeRes} from "../schemas";
import {createServerSdk} from "@/lib/sdk";
import z from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as z.infer<typeof FinalizeReq>;

    console.log('[finalize] Request body:', body);

    const validatedData = FinalizeReq.parse(body);

    console.log('[finalize] Validated data:', validatedData);

    const { booksApi } = createServerSdk();
    const resp = await booksApi.finalizeBook({
      finalizeBookDto: {
        bookId: validatedData.bookId,
      },
    });

    console.log('[finalize] Backend response:', resp.data);

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

    return NextResponse.json(response, {status: resp.status});
  } catch (error) {
    console.error('[finalize] Error:', error);
    if (error instanceof Error) {
      console.error('[finalize] Error message:', error.message);
      console.error('[finalize] Error stack:', error.stack);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
