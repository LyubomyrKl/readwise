import { NextRequest, NextResponse } from "next/server";
import { booksApi, axios } from "@/lib/api";
import type { UpdateReadingPositionDto } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UpdateReadingPositionDto;
    const resp = await booksApi.updateReadingPosition(body);

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
