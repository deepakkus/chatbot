"use client";

import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";

interface Message {
  id: number;
  sender: string;
  content: string;
  fileUrl?: string;
  createdAt: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  const loadMessages = async () => {
    const res = await fetch("/api/chat");
    const data = await res.json();
    setMessages(data);
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const uploadToVercelBlob = async (file: File): Promise<string> => {
    const res = await fetch("/api/blob/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: file.name,
        contentType: file.type,
      }),
    });

    const { url } = await res.json();

    const uploadRes = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: file,
    });

    if (!uploadRes.ok) throw new Error("Upload failed");

    return url.split("?")[0]; // Return clean blob URL
  };

  const sendMessage = async () => {
    if (!input.trim() && !file) return;
    setLoading(true);

    try {
      let fileUrl: string | undefined = undefined;

      if (file) {
        fileUrl = await uploadToVercelBlob(file);
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: input,
          fileUrl, // send the blob URL to your backend
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        console.error("Error sending message:", err);
        return;
      }

      await res.json();
      setInput("");
      setFile(null);
      await loadMessages();
    } catch (err) {
      console.error("Send message failed:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-4">
      <div className="bg-white shadow rounded-lg p-4 h-[500px] overflow-y-auto space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-2 rounded-md ${
              msg.sender === "user"
                ? "bg-blue-100 text-right"
                : "bg-gray-100 text-left"
            }`}
          >
            <p>{msg.content}</p>
            {msg.fileUrl && (
              <a
                href={msg.fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-500 underline"
              >
                📎 Download Attachment
              </a>
            )}
            <div>
              <span className="text-xs text-gray-400">
                {new Date(msg.createdAt).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}
        {loading && <p className="text-gray-500">Bot is typing...</p>}
      </div>

      <div className="flex mt-4 gap-2 items-center">
        <label className="flex items-center cursor-pointer text-blue-500">
          <Paperclip className="w-5 h-5" />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
          />
        </label>

        {file && (
          <span className="text-sm text-gray-500 truncate max-w-[150px]">
            {file.name}
          </span>
        )}

        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 border rounded-l px-4 py-2"
          placeholder="Type your message..."
        />
        <button
          onClick={sendMessage}
          className="bg-blue-500 text-white px-4 py-2 rounded-r disabled:opacity-50"
          disabled={loading}
        >
          Send
        </button>
      </div>
    </div>
  );
}
