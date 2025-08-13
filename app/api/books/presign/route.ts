import { NextRequest, NextResponse } from "next/server";
import { PresignReq } from "../schemas";
import { booksApi } from "@/lib/sdk";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validatedData = PresignReq.parse(body);

    const data = await booksApi.presign({ createBookDto: validatedData });

    const response = {
      bookId: data.data.bookId,
      storageKey: data.data.storageKey,
      upload: {
        url: data.data.upload.url,
        headers: data.data.upload.headers,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
