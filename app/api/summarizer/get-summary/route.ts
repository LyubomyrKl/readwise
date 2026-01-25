import { createServerSdk } from "@/lib/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { GetSummaryDto } from "@satoru-satoshi/summarize-api-sdk";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GetSummaryDto;

    const { summarizerApi } = createServerSdk();
    const resp = await summarizerApi.getSummary({
      getSummaryDto: body,
    });

    return NextResponse.json(resp.data, { status: resp.status });
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
