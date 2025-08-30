import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY as string);

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // --- 1. Google Custom Search ---
    let results: { title: string; snippet: string; link: string }[] = [];
    try {
      const searchRes = await fetch(
        `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_SEARCH_ENGINE_ID}&q=${encodeURIComponent(
          query
        )}`
      );
      const searchData = await searchRes.json();
      if (searchData.items) {
        results = searchData.items.slice(0, 5).map((item: any) => ({
          title: item.title,
          snippet: item.snippet,
          link: item.link,
        }));
      }
    } catch (e) {
      console.warn("⚠️ Google Search failed:", e);
    }

    // --- 2. Ask Gemini ---
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
The user asked: "${query}"

Here are some web search results (if available):
${results.length ? results.map((r, i) => `${i + 1}. ${r.title}\n${r.snippet}\n${r.link}`).join("\n\n") : "No search results available."}

Please provide:
1. A short helpful answer to the user.
2. A list of relevant links if provided.
`;

    let answer = "";
    let raw: any = null;

    try {
      const geminiRes = await model.generateContent(prompt);
      raw = geminiRes;

      // Try multiple extraction paths
      if (geminiRes?.response?.text) {
        answer = geminiRes.response.text().trim();
      } else if (geminiRes?.response?.candidates?.[0]?.content?.parts?.[0]?.text) {
        answer = geminiRes.response.candidates[0].content.parts[0].text.trim();
      } else if (JSON.stringify(geminiRes).includes("text")) {
        // brute force last fallback
        answer = "⚠️ Gemini returned text, but parser missed it. See rawGemini.";
      }
    } catch (e) {
      console.error("⚠️ Gemini call failed:", e);
    }

    // --- 3. Ensure we always reply ---
    if (!answer || answer.trim() === "") {
      if (results.length) {
        answer = `I couldn't generate a direct answer, but here are some relevant links:\n\n${results
          .map((r) => `- [${r.title}](${r.link})`)
          .join("\n")}`;
      } else {
        answer = "I couldn't find any information right now. Please try rephrasing your query.";
      }
    }

    return NextResponse.json({
      answer,
      sources: results,
      rawGemini: raw, // temporary debugging
    });
  } catch (err: unknown) {
    console.error("Search API error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
