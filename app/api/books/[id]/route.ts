import { booksApi, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { transformBookUrls } from "../schemas";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resp = await booksApi.getBook(id);
    const book = transformBookUrls(resp.data);

    return NextResponse.json({ data: book }, {
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
