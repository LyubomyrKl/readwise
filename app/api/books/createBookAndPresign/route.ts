import { NextRequest, NextResponse } from "next/server";
import { PresignReq } from "../schemas";
import { booksApi } from "@/lib/sdk";
import z from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as z.infer<typeof PresignReq>;

    const validatedData = PresignReq.parse(body);

    const data = await booksApi.createBookAndPresign({
      createBookDto: validatedData,
    });

    const response = {
      bookId: data.data.bookId,
      storageKey: data.data.storageKey,
      upload: {
        url: data.data.presignUploadInfo.url,
        headers: data.data.presignUploadInfo.headers,
      },
      coverStorageKey: data.data.customCoverStorageKey,
      coverUpload: data.data.customCoverPresignInfo,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("createBookAndPresign error:", error);

    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
