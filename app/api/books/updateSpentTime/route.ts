import { NextRequest, NextResponse } from "next/server";
import { createServerSdk } from "@/lib/sdk";
import { z } from "zod";
import {UpdateSpentTimeReq} from "@/app/api/books/schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = UpdateSpentTimeReq.parse(body);

    const { booksApi } = createServerSdk();

    const resp = await booksApi.updateTimeSpent({
      updateSpentTimeDto: {
        bookId: validatedData.bookId,
        amount: validatedData.amount,
      },
    });

    return { status: resp.status };
  } catch (error) {
    console.error("Update cover finalize error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
