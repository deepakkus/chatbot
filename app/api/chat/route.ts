// app/api/chat/route.ts

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";

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

// --- POST Message with optional fileUrl ---
export async function POST(req: Request) {
  try {
    const { message, fileUrl } = await req.json();

    if (!message?.trim() && !fileUrl) {
      return NextResponse.json({ error: "Empty message and no file" }, { status: 400 });
    }

    let fileContent: string | null = null;

    // Attempt to read file if it's a text-based URL
    if (fileUrl && fileUrl.endsWith(".txt")) {
      try {
        const fileRes = await fetch(fileUrl);
        fileContent = await fileRes.text();
      } catch (e) {
        console.warn("Failed to read file content from blob:", e);
      }
    }

    // ✅ Save USER message
    await prisma.message.create({
      data: {
        sender: "user",
        content: message || "",
        ...(fileUrl && { fileUrl }),
      },
    });

    // 🔮 Gemini reply
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

    /*const botResponse =
      result.response.candidates
        ?.map((c) => c.content.parts.map((p) => ("text" in p ? p.text : "")).join(""))
        .join("\n")
        .trim() || "No response from Gemini";*/
	const botResponse = result?.response?.text() || "No response from Gemini";
    // ✅ Save BOT message
    await prisma.message.create({
      data: {
        sender: "bot",
        content: botResponse,
      },
    });

    return NextResponse.json({ response: botResponse });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json({ error: "Gemini or save error" }, { status: 500 });
  }
}
