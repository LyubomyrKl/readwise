import { NextRequest, NextResponse } from "next/server";
import { createServerSdk } from "@/lib/sdk";

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()

        const { booksApi } = createServerSdk();
        const resp = await booksApi.setBookToFavorite({
            setBookToFavoriteDto: body,
        });

        return NextResponse.json(
            {
                bookId: body.bookId,
                status: "ready",
            },
            { status: resp.status }
        );
    } catch (error) {
        console.error("Update cover finalize error:", error);
        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
