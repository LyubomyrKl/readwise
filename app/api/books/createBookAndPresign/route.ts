import { NextRequest, NextResponse } from "next/server";
import { booksApi} from "@/lib/sdk";
import type { CreateBookDto } from "@satoru-satoshi/summarize-api-sdk";

export async function POST(request: NextRequest) {
  try {
      console.log('body', 'body');

    const body = (await request.json()) as CreateBookDto;
    const resp = await booksApi.createBookAndPresign({
      createBookDto: body,
    });

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
  } catch (err) {
     const error = err as Error;
     return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
