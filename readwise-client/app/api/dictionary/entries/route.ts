import { dictionaryApi, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = {
      q: searchParams.get("q") || undefined,
      masteryLevel: searchParams.has("masteryLevel")
        ? Number(searchParams.get("masteryLevel"))
        : undefined,
      tag: searchParams.get("tag") || undefined,
      sortBy: (searchParams.get("sortBy") as "createdAt" | "word" | "masteryLevel") || undefined,
      sortOrder: (searchParams.get("sortOrder") as "asc" | "desc") || undefined,
      skip: searchParams.has("skip") ? Number(searchParams.get("skip")) : undefined,
      take: searchParams.has("take") ? Number(searchParams.get("take")) : undefined,
    };

    const resp = await dictionaryApi.getEntries(query);
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

export async function POST(request: NextRequest) {
  console.log("[POST /api/dictionary/entries] API_URL:", process.env.API_URL);
  try {
    const body = await request.json();
    console.log("[POST /api/dictionary/entries] Body:", JSON.stringify(body));
    const resp = await dictionaryApi.createEntry(body);
    console.log("[POST /api/dictionary/entries] Success:", resp.status);
    return NextResponse.json(resp.data, { status: resp.status });
  } catch (error) {
    console.error("[POST /api/dictionary/entries] Error:", error);
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
