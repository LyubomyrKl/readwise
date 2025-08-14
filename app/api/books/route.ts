import { booksApi } from "@/lib/sdk";
import { GetAllBooksRes } from "./schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(_: NextRequest) {
  try {
    const data = await booksApi.getAllBooks();

    const books = GetAllBooksRes.parse(data);

    return NextResponse.json(books);
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
