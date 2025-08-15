import { booksApi } from "@/lib/sdk";
import { BookResponse } from "@/app/api/books/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const data = await booksApi.getBook({
      id,
    });

    if (!data.data) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    console.log("data:", data);
    const book = BookResponse.parse(data.data);

    return NextResponse.json({ data: book });
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
