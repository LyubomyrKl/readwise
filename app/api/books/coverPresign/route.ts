import { booksApi } from "@/lib/sdk";
import { NextRequest, NextResponse } from "next/server";
import { CoverPresignReq } from "../schemas";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookId, ...uploadData } = body;
    const validatedData = CoverPresignReq.parse(uploadData);

    const response = await booksApi.coverPresign({
      presignedUploadDto: {
        filename: validatedData.filename,
        mime: validatedData.mime,
      },
    });

    return NextResponse.json({
      storageKey: response.data.storageKey,
      upload: {
        url: response.data.presignUploadInfo.url,
        headers: response.data.presignUploadInfo.headers,
      },
    });
  } catch (error) {
    console.error("Cover presign error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
