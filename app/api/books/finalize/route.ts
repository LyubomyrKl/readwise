import { NextRequest, NextResponse } from "next/server";
import { createServerSdk } from "@/lib/sdk";
import type { FinalizeBookDto } from "@satoru-satoshi/summarize-api-sdk";
import axios from "axios";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as FinalizeBookDto;
    const { booksApi } = createServerSdk();
    const resp = await booksApi.finalizeBook({
      finalizeBookDto: body,
    });

    if (!resp.data.bookId || resp.data.status !== "ready") {
      return NextResponse.json(
        { error: "Book is not finalized or still pending." },
        { status: 400 }
      );
    }

    return NextResponse.json(resp.data, { status: resp.status });
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
