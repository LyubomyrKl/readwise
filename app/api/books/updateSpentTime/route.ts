import { NextRequest, NextResponse } from "next/server";
import { createServerSdk } from "@/lib/sdk";
import type { UpdateSpentTimeDto } from "@satoru-satoshi/summarize-api-sdk";
import axios from "axios";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateSpentTimeDto;
    const { booksApi } = createServerSdk();
    const resp = await booksApi.updateTimeSpent({
      updateSpentTimeDto: body,
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
