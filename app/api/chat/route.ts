// app/api/chat/route.ts

import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { PrismaClient } from "@prisma/client";
import formidable, { Fields, Files } from "formidable";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import mime from "mime-types";
import type { IncomingMessage } from "http";

export const runtime = "nodejs";

export const config = {
  api: {
    bodyParser: false,
  },
};

const prisma = new PrismaClient();
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);

function toNodeReadable(req: Request): Readable {
  const reader = req.body?.getReader();
  return new Readable({
    async read() {
      if (!reader) {
        this.push(null);
        return;
      }
      const { done, value } = await reader.read();
      if (done) this.push(null);
      else this.push(value);
    },
  });
}

async function parseMultipartForm(req: Request): Promise<{ fields: Fields; files: Files }> {
  const uploadDir = path.join(process.cwd(), "public/uploads");
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  const form = formidable({
    uploadDir,
    keepExtensions: true,
    multiples: false,
  });

  const nodeReq: IncomingMessage = Object.assign(toNodeReadable(req), {
    headers: Object.fromEntries(req.headers.entries()),
    method: req.method,
    url: "",
  });

  return new Promise((resolve, reject) => {
    form.parse(nodeReq, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

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
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ error: "Invalid Content-Type" }, { status: 400 });
    }

    const { fields, files } = await parseMultipartForm(req);

    const rawMessage = fields.content || fields.message;
    const message = Array.isArray(rawMessage) ? rawMessage[0] : rawMessage || "";

    if (!message.trim() && !files?.file?.[0]) {
      return NextResponse.json({ error: "Empty message and no file" }, { status: 400 });
    }

    const file = files.file?.[0];
    let fileUrl: string | null = null;
    let fileContent: string | null = null;
    let fileMime: string | null = null;

    if (file?.filepath) {
      const fileName = path.basename(file.filepath);
      fileUrl = `/uploads/${fileName}`;
      fileMime = mime.lookup(file.filepath) || "application/octet-stream";

      // Read and extract text content if possible (basic .txt or .json)
      if (fileMime === "text/plain" || fileMime === "application/json") {
        fileContent = fs.readFileSync(file.filepath, "utf-8");
      }

      // You can add PDF or image parsing logic here
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
