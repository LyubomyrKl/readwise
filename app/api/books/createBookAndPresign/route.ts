import { NextRequest, NextResponse } from "next/server";
import { booksApi, axios } from "@/lib/api";
import type { CreateBookDto } from "@/lib/types";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CreateBookDto;
    const resp = await booksApi.createBookAndPresign(body);

    return NextResponse.json(
      {
        bookId: resp.data.bookId,
        storageKey: resp.data.storageKey,
        upload: {
          url: resp.data.presignUploadInfo.url,
          headers: resp.data.presignUploadInfo.headers,
        },
        coverStorageKey: resp.data.customCoverStorageKey,
        coverUpload: resp.data.customCoverPresignInfo,
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
