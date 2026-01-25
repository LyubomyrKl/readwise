import { NextRequest, NextResponse } from "next/server";
import { createServerSdk } from "@/lib/sdk";
import type { UpdateSpentTimeDto } from "@satoru-satoshi/summarize-api-sdk";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateSpentTimeDto;

    const { booksApi } = createServerSdk();
    const resp = await booksApi.updateTimeSpent({
      updateSpentTimeDto: body,
    });

    return NextResponse.json({ status: "ok" }, { status: resp.status });
  } catch (error) {
    console.error("Update spent time error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
