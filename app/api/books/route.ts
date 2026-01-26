import { createServerSdk } from "@/lib/sdk";
import { NextResponse } from "next/server";
import axios from "axios";

export async function GET() {
  try {
    const { booksApi } = createServerSdk();
    const resp = await booksApi.getAllBooks();

    return NextResponse.json(resp.data ?? [], { status: resp.status });
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
