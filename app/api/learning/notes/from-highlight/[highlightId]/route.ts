import { learningApi, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ highlightId: string }> }
) {
  try {
    const { highlightId } = await params;
    const body = await request.json();
    const resp = await learningApi.createNoteFromHighlight(highlightId, body);
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
