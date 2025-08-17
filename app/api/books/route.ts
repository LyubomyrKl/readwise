import { createServerSdk } from "@/lib/sdk";
import { GetAllBooksRes } from "./schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { booksApi } = createServerSdk(req);
    const resp = await booksApi.getAllBooks();
    const booksArray = resp?.data ?? [];
    const books = GetAllBooksRes.parse(booksArray);

    const out = NextResponse.json(books, { status: resp.status });
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
