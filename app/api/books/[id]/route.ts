import { booksApi } from "@/lib/sdk";
import { BookResponse } from "@/app/api/books/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  _: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const data = await booksApi.getBook({
      id,
    });

    console.log("Fetching book with ID:", id);
    // Log the actual data structure for debugging
    console.log("Raw book data:", data);

    if (!data) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    // Try to parse with schema, but handle validation errors gracefully
    try {
      const book = BookResponse.parse(data);
      return NextResponse.json(book);
    } catch (validationError) {
      console.error("Schema validation failed:", validationError);

      // Return the raw data if schema validation fails (for debugging)
      // In production, you might want to map the data to the expected format
      // Create a clean object to avoid circular references
      const cleanData = JSON.parse(
        JSON.stringify(data, (key, value) => {
          if (
            value &&
            typeof value === "object" &&
            value.constructor?.name === "ClientRequest"
          ) {
            return "[ClientRequest]";
          }
          if (
            value &&
            typeof value === "object" &&
            value.constructor?.name === "IncomingMessage"
          ) {
            return "[IncomingMessage]";
          }
          return value;
        })
      );
      return NextResponse.json(cleanData);
    }
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
