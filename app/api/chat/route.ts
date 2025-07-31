// app/api/chat/route.ts

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";
import { put } from "@vercel/blob";

export const runtime = "edge";

export const config = {
  api: {
    bodyParser: false,
  },
};

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

// --- GET Chat History ---
export async function GET() {
  try {
    const messages = await prisma.message.findMany({
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(messages);
  } catch (error) {
    console.error("GET /api/chat error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}

// --- POST Message with optional file ---
export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const rawMessage = formData.get("content") || formData.get("message");
    const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage?.toString() || "";

    const file = formData.get("file") as File | null;
    let fileUrl: string | null = null;
    let fileContent: string | null = null;

    if (!message.trim() && !file) {
      return NextResponse.json({ error: "Empty message and no file" }, { status: 400 });
    }

    if (file && file.size > 0) {
      // Upload to Vercel Blob
      const blob = await put(file.name, file.stream(), { access: "public" });
      fileUrl = blob.url;

      // Extract text content if file is readable as text
      const textTypes = ["text/plain", "application/json"];
      if (textTypes.includes(file.type)) {
        const text = await file.text();
        fileContent = text;
      }
    }

    // ✅ Save USER message
    await prisma.message.create({
      data: {
        sender: "user",
        content: message,
        ...(fileUrl && { fileUrl }),
      },
    });

    // 🔮 Generate Gemini response
    const model = genAI.getGenerativeModel({
      model: "models/gemini-2.5-pro",
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.8,
      },
    });

    const parts = [];
    if (message) parts.push({ text: message });
    if (fileContent) parts.push({ text: `Attached file content:\n\n${fileContent}` });

    const result = await model.generateContent({
      contents: [{ role: "user", parts }],
    });

    const botResponse =
      result.response.candidates
        ?.map((c) => c.content.parts.map((p) => ("text" in p ? p.text : "")).join(""))
        .join("\n")
        .trim() || "No response from Gemini";

    // ✅ Save BOT response
    await prisma.message.create({
      data: {
        sender: "bot",
        content: botResponse,
      },
    });

    return NextResponse.json({ response: botResponse });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json({ error: "Gemini or upload error" }, { status: 500 });
  }
}
