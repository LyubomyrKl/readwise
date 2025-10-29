import { createServerSdk } from '@/lib/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { CoverPresignReq } from '../schemas';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { bookId, ...uploadData } = body;
    const validatedData = CoverPresignReq.parse(uploadData);

    const { booksApi } = createServerSdk();
    const resp = await booksApi.coverPresign({
      presignedUploadDto: {
        filename: validatedData.filename,
        mime: validatedData.mime,
      },
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
