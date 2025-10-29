import {NextRequest, NextResponse} from "next/server";
import {PresignReq} from "../schemas";
import {createServerSdk} from "@/lib/sdk";
import z from "zod";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as z.infer<typeof PresignReq>;

    console.log("createBookAndPresign request body:", {
      filename: body.filename,
      mime: body.mime,
      title: body.title,
      sizeBytes: body.sizeBytes,
    });

    const validatedData = PresignReq.parse(body);

    console.log("Validation successful, calling books API...");

    const { booksApi } = createServerSdk();
    const resp = await booksApi.createBookAndPresign({
      createBookDto: validatedData,
    });

    console.log("Books API response received:", {
      bookId: resp.data.bookId,
      hasPresignInfo: !!resp.data.presignUploadInfo,
    });

    const response = {
      bookId: resp.data.bookId,
      storageKey: resp.data.storageKey,
      upload: {
        url: resp.data.presignUploadInfo.url,
        headers: resp.data.presignUploadInfo.headers,
      },
      coverStorageKey: resp.data.customCoverStorageKey,
      coverUpload: resp.data.customCoverPresignInfo,
    };

    return NextResponse.json(response, {status: resp.status});
  } catch (error) {
    console.error("createBookAndPresign error:", error);

    if (error instanceof z.ZodError) {
      console.error("Validation errors:", error.issues);
      return NextResponse.json(
        {
          error: "Validation failed",
          details: error.issues,
        },
        { status: 400 }
      );
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
