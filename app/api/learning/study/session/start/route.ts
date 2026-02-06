import { learningApi, axios } from "@/lib/api";
import { NextResponse } from "next/server";

export async function POST() {
  try {
    const resp = await learningApi.startSession();
    return NextResponse.json(resp.data, { status: resp.status });
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
