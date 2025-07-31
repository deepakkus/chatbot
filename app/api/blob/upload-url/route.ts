// app/api/blob/upload-url/route.ts
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  const blob = await put(file.name, file.stream(), {
    access: "public",
  });

  return NextResponse.json({ url: blob.url });
}
