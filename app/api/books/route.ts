import { createServerSdk } from "@/lib/sdk";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const { booksApi } = createServerSdk();
    const resp = await booksApi.getAllBooks();

    return NextResponse.json(resp.data ?? [], { status: resp.status });
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
