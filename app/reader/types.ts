import z from "zod";
import type { BookResponse } from "../api/books/schemas";

export type IBook = z.infer<typeof BookResponse>;
