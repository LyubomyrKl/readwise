import { booksApi, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import type { PresignedUploadDto } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookId, ...uploadData } = body as { bookId?: string } & PresignedUploadDto;

    const resp = await booksApi.coverPresign(uploadData);

    return NextResponse.json(
      {
        storageKey: resp.data.storageKey,
        upload: {
          url: resp.data.presignUploadInfo.url,
          headers: resp.data.presignUploadInfo.headers,
        },
      },
      { status: resp.status }
    );
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
