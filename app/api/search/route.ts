import { NextRequest, NextResponse } from "next/server";

// Gemini client
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);

// --- Types ---
interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
}

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // 1. Call Google Custom Search API
    const searchRes = await fetch(
      `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_SEARCH_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(
        query
      )}`
    );

    const searchData = await searchRes.json();

    if (!searchData.items) {
      return NextResponse.json({ error: "No results found" }, { status: 404 });
    }

    // Extract top 5 results (typed, no "any")
    const results: GoogleSearchItem[] = searchData.items.slice(0, 5).map((item: Record<string, unknown>) => ({
      title: String(item.title ?? ""),
      snippet: String(item.snippet ?? ""),
      link: String(item.link ?? ""),
    }));

    // 2. Feed into Gemini
    const context = results
      .map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.link}`)
      .join("\n\n");

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
The user asked: "${query}".

Here are some web search results:
${context}

Please provide:
1. A short summary answer to the user.
2. A list of relevant links for further reading.
`;

    const geminiRes = await model.generateContent(prompt);
    const text = geminiRes.response.text();

    // 3. Return AI summary + results
    return NextResponse.json({
      answer: text,
      sources: results,
    });
  } catch (err) {
    console.error("Search API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
