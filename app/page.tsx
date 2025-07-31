import Chat from "@/components/Chat";

export default function Home() {
  return (
    <main className="min-h-screen bg-gray-50 p-4">
      <h1 className="text-2xl font-bold mb-4 text-center">Chatbot</h1>
      <Chat />
    </main>
  );
}
