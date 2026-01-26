import { createServerSdk } from "@/lib/sdk";
import { NextRequest, NextResponse } from "next/server";
import axios from "axios";

export async function POST(request: NextRequest) {
  try {
    const { bookId } = await request.json();
    const { booksApi } = createServerSdk();
    const resp = await booksApi.setLastAccessed({
      updateLastAccessedDto: { bookId },
    });

    return NextResponse.json({ status: "ok" }, { status: resp.status });
  } catch (error) {
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
