import { summarizerApi, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import type { GetSummaryDto } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as GetSummaryDto;
    const resp = await summarizerApi.getSummary(body);

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
