import { booksApi, axios } from "@/lib/api";
import { NextResponse } from "next/server";
import { transformBookUrls } from "./schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const resp = await booksApi.getAllBooks();
    const books = (resp.data ?? []).map(transformBookUrls);

    return NextResponse.json(books, {
      status: resp.status,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.log(error);
    if (axios.isAxiosError(error) && error.response) {
      return NextResponse.json(error.response.data, {
        status: error.response.status,
      });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
