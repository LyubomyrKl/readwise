import { dictionaryApi, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ term: string }> }
) {
  try {
    const { term } = await params;
    const resp = await dictionaryApi.getWordWithRelated(term);
    return NextResponse.json(resp.data, {
      status: resp.status,
      headers: { "Cache-Control": "no-store" },
    });
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
