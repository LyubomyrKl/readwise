import { NextRequest, NextResponse } from "next/server";
import { PresignReq } from "../schemas";
import { booksApi } from "@/lib/sdk";
import z from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as z.infer<typeof PresignReq>;

    console.log("createBookAndPresign request body:", {
      filename: body.filename,
      mime: body.mime,
      title: body.title,
      sizeBytes: body.sizeBytes
    });

    const validatedData = PresignReq.parse(body);

    console.log("Validation successful, calling books API...");

    const data = await booksApi.createBookAndPresign({
      createBookDto: validatedData,
    });

    console.log("Books API response received:", {
      bookId: data.data.bookId,
      hasPresignInfo: !!data.data.presignUploadInfo
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
    
    if (error instanceof z.ZodError) {
      console.error("Validation errors:", error.issues);
      return NextResponse.json({ 
        error: "Validation failed", 
        details: error.issues 
      }, { status: 400 });
    }
    
    if (error instanceof Error) {
      console.error("Error message:", error.message);
      console.error("Error stack:", error.stack);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    
    console.error("Unknown error type:", typeof error, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
