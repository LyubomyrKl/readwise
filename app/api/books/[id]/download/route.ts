import { booksApi, axios } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const resp = await booksApi.downloadBook(id);

    const contentType = resp.headers["content-type"] || "application/octet-stream";
    const contentDisposition = resp.headers["content-disposition"];
    const contentLength = resp.headers["content-length"];

    const headers: HeadersInit = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    };

    if (contentDisposition) {
      headers["Content-Disposition"] = contentDisposition;
    }

    if (contentLength) {
      headers["Content-Length"] = contentLength;
    }

    // Ensure data is a proper Buffer for binary response
    const data = Buffer.isBuffer(resp.data)
      ? resp.data
      : Buffer.from(resp.data);

    return new NextResponse(data, {
      status: 200,
      headers,
    });
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
