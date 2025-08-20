import { createServerSdk } from "@/lib/sdk";
import { SummarizeReq, SummarizeRes } from "./schemas";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedData = SummarizeReq.parse(body);

    const { summarizerApi } = createServerSdk();

    const resp = await summarizerApi.requestSummary({
      requestSummaryDto: validatedData,
    });

    const result = SummarizeRes.parse(resp.data);

    return NextResponse.json(result, { status: resp.status });
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
