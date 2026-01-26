import { createServerSdk } from "@/lib/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { PresignedUploadDto } from "@satoru-satoshi/summarize-api-sdk";
import axios from "axios";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookId, ...uploadData } = body as { bookId?: string } & PresignedUploadDto;

    const { booksApi } = createServerSdk();
    const resp = await booksApi.coverPresign({
      presignedUploadDto: uploadData,
    });

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
