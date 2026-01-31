import { booksApi, axios } from "@/lib/api";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const resp = await booksApi.getAllBooks();

    return NextResponse.json(resp.data ?? [], { status: resp.status });
  } catch (error) {
      console.log(error);
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
