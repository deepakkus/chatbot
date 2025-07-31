// app/api/chat/route.ts
export const runtime = 'nodejs';

import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

console.log(process.env.DATABASE_URL);

// === GET: Fetch Chat History ===
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

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { message } = body;

    await prisma.message.create({
      data: { content: message, sender: "user" },
    });

    const model = genAI.getGenerativeModel({
      model: "models/gemini-2.5-pro",
      generationConfig: {
        maxOutputTokens: 2048,
        temperature: 0.8,
      },
    });

    const result = await model.generateContent(message);

    // Combine all response parts properly
    const botResponse = result.response.candidates
      ?.map((c) =>
        c.content.parts.map((p) => ("text" in p ? p.text : "")).join("")
      )
      .join("\n")
      .trim() || "No response from Gemini";

    if (!botResponse) {
      console.warn("⚠️ Gemini returned empty response for:", message);
    }

    await prisma.message.create({
      data: { content: botResponse, sender: "bot" },
    });

    return NextResponse.json({ response: botResponse });
  } catch (error) {
    console.error("POST /api/chat error:", error);
    return NextResponse.json({ error: "Gemini Error" }, { status: 500 });
  }
}

