import { createServerSdk } from "@/lib/sdk";
import { GetSummaryReq, GetSummaryRes } from "../schemas";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validatedData = GetSummaryReq.parse(body);

    const { summarizerApi } = createServerSdk();

    const resp = await summarizerApi.getSummary({
      getSummaryDto: validatedData,
    });

    const result = GetSummaryRes.parse(resp.data);

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