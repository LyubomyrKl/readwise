import {createServerSdk} from "@/lib/sdk";
import {NextResponse} from "next/server";

export async function POST(req: { bookId: string  }) {
    try {
        const { bookId } = req;
        const { booksApi } = createServerSdk();

        const resp = await booksApi.setLastAccessed({
            updateLastAccessedDto: {
                bookId
            }
        });

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
