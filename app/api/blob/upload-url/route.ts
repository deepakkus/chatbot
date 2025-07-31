// app/api/blob/upload-url/route.ts
import { NextResponse } from "next/server";
import { createUploadUrl } from "@vercel/blob";

export async function POST() {
  try {
    const { url } = await createUploadUrl();
    return NextResponse.json({ url });
  } catch (err) {
    console.error("Blob upload-url error:", err);
    return NextResponse.json({ error: "Failed to generate upload URL" }, { status: 500 });
  }
}
