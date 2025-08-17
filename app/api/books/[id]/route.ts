import { createServerSdk } from "@/lib/sdk";
import { BookResponse } from "@/app/api/books/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { booksApi } = createServerSdk();

    const resp = await booksApi.getBook({
      id,
    });

    if (!resp.data) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    const book = BookResponse.parse(resp.data);

    const out = NextResponse.json({ data: book }, { status: resp.status });
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
