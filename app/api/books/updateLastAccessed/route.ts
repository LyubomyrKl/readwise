import {createServerSdk} from "@/lib/sdk";
import {NextResponse} from "next/server";

export async function updateLastAccessed(req: { bookId: string  }) {
    try {
        const { bookId } = req;
        const { booksApi } = createServerSdk();

        const resp = await booksApi.updateTimeSpent({
            updateSpentTimeDto: {
                bookId,
                amount: 1000,
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
