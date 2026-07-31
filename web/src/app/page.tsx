'use client';

import { useState, useEffect, useRef } from 'react';

interface Message {
  id: string;
  sender_type: 'user' | 'bot';
  content: string;
  created_at: string;
}

interface Bot {
  id: string;
  name: string;
  avatar_url?: string;
  personality: string;
}

export default function MobileChatPage() {
  const [bots, setBots] = useState<Bot[]>([
    {
      id: 'demo-bot-1',
      name: 'น้องพะยูน ปลาน้อยจิตใจดี 🌊',
      avatar_url: '🐬',
      personality: 'เพื่อนสนิทที่คอยฟังและให้กำลังใจอย่างนุ่มนวล ชอบฟังเรื่องราวทะเลยามเช้า',
    },
    {
      id: 'demo-bot-2',
      name: 'เจ้าชายนกนางนวล 🪶',
      avatar_url: '🦤',
      personality: 'ชวนคุยเก่ง ช่างสังเกต อารมณ์ดี ชอบเล่าเรื่องการเดินทางริมชายหาด',
    },
  ]);

  const [selectedBot, setSelectedBot] = useState<Bot>(bots[0]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'msg-1',
      sender_type: 'bot',
      content: 'สวัสดีวันสบายๆ ยามเช้ากลางทะเลนะคะ~ วันนี้มีเรื่องอะไรอยากเล่าให้ฟังหรือเปล่าเอ่ย? 🐚✨',
      created_at: new Date().toISOString(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelUsed, setModelUsed] = useState<string>('gemini-2.5-flash-lite');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || isLoading) return;

    const userText = inputMessage.trim();
    const userMsg: Message = {
      id: `usr-${Date.now()}`,
      sender_type: 'user',
      content: userText,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputMessage('');
    setIsLoading(true);

    try {
      // Call Elysia API Service
      const res = await fetch('http://localhost:3001/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId: 'demo-chat-session',
          botId: selectedBot.id,
          message: userText,
        }),
      });

      if (!res.ok) throw new Error('API server unreachable');

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);
      setModelUsed(data.model_used || 'gemini-2.5-flash-lite');
    } catch {
      // Demo Fallback for local testing preview
      setTimeout(() => {
        const botReply: Message = {
          id: `bot-${Date.now()}`,
          sender_type: 'bot',
          content: `รับฟังอยู่นะคะ ✨ (${userText}) ชอบเวลาได้คุยแลกเปลี่ยนความคิดเห็นกันแบบนี้จังเลยค่ะ 🌊`,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, botReply]);
        setIsLoading(false);
      }, 900);
      return;
    }

    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-[#faf8f5] shadow-xl overflow-hidden relative">
      {/* 🌊 Signature Ocean Wave Header */}
      <header className="ocean-wave-header px-4 pt-4 pb-3 flex items-center justify-between z-10 rounded-b-3xl">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-white/90 border-2 border-sky-200 flex items-center justify-center text-2xl shadow-sm">
            {selectedBot.avatar_url || '🌊'}
          </div>
          <div>
            <h1 className="font-['Mali'] text-base font-bold text-sky-900 leading-tight">
              {selectedBot.name}
            </h1>
            <div className="flex items-center space-x-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-teal-400 animate-pulse"></span>
              <span className="text-xs font-medium text-sky-700">พร้อมรับฟังเสมอ</span>
            </div>
          </div>
        </div>

        {/* Bot Persona Quick Switcher */}
        <select
          aria-label="เลือกตัวละครบอท"
          className="bg-white/80 border border-sky-200 text-sky-900 text-xs rounded-xl px-2.5 py-1.5 font-medium outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer"
          value={selectedBot.id}
          onChange={(e) => {
            const found = bots.find((b) => b.id === e.target.value);
            if (found) setSelectedBot(found);
          }}
        >
          {bots.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </header>

      {/* Model Cascade Badge */}
      <div className="px-4 py-1.5 bg-sky-50/70 border-b border-sky-100 flex items-center justify-between text-[11px] text-sky-800">
        <span className="flex items-center space-x-1">
          <span>🐚</span>
          <span>โหมดประหยัดพลังงาน: <b>{modelUsed}</b></span>
        </span>
        <span className="text-teal-600 font-semibold">Gemini Cascade</span>
      </div>

      {/* 💬 Chat Messages Stream */}
      <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.sender_type === 'user' ? 'items-end' : 'items-start'
            }`}
          >
            <div
              className={`max-w-[82%] px-4 py-3 text-sm leading-relaxed ${
                msg.sender_type === 'user'
                  ? 'user-bubble rounded-2xl rounded-tr-xs font-normal'
                  : 'bot-bubble rounded-2xl rounded-tl-xs text-slate-800 font-normal'
              }`}
            >
              {msg.content}
            </div>
            <span className="text-[10px] text-slate-400 mt-1 px-1">
              {new Date(msg.created_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        ))}

        {isLoading && (
          <div className="flex items-center space-x-2 text-sky-700 bg-sky-100/60 w-fit px-3 py-2 rounded-2xl text-xs font-medium">
            <span className="animate-bounce">🫧</span>
            <span>กำลังเรียบเรียงความคิดช้าๆ...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* 📥 Bottom Anchored Input Bar (Touch Target >= 44px, Safe Padding) */}
      <footer className="bg-white/95 border-t border-sky-100 p-3 safe-bottom-padding z-10 shadow-lg">
        <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
          <input
            type="text"
            placeholder="พิมพ์ข้อความคุยกับบอทที่นี่..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            className="flex-1 bg-[#f0f9ff] border border-sky-200 text-slate-800 placeholder-sky-400 text-sm rounded-2xl px-4 py-3 min-h-[44px] outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all"
          />
          <button
            type="submit"
            disabled={!inputMessage.trim() || isLoading}
            className="min-h-[44px] min-w-[44px] px-4 py-2 bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold text-sm rounded-2xl flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all shadow-md cursor-pointer active:scale-95"
          >
            ส่ง ✨
          </button>
        </form>
      </footer>
    </div>
  );
}
