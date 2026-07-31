'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  sender_type: 'user' | 'bot';
  content: string;
  inner_thought?: string;
  created_at: string;
}

interface Bot {
  id: string;
  name: string;
  avatar_url?: string;
  personality: string;
  speech_style?: string;
  likes_dislikes?: string;
  boundaries?: string;
  system_prompt?: string;
  temperature?: number;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

const AVATAR_PRESETS = [
  '🦭', '🐬', '🪼', '💖', '🌸', '✨', '🦊', '🐱', '☕', '🎨'
];

function getRelationshipRank(score: number): { name: string; icon: string; color: string } {
  if (score >= 80) return { name: 'ผูกพันลึกซึ้ง', icon: '💞', color: 'from-pink-500 to-rose-500' };
  if (score >= 60) return { name: 'คนพิเศษ', icon: '💖', color: 'from-purple-500 to-pink-500' };
  if (score >= 40) return { name: 'เพื่อนสนิท', icon: '🤝', color: 'from-sky-500 to-teal-500' };
  if (score >= 20) return { name: 'คนรู้จัก', icon: '👋', color: 'from-teal-400 to-emerald-500' };
  return { name: 'คนแปลกหน้า', icon: '❄️', color: 'from-slate-400 to-slate-500' };
}

export default function MobileChatPage() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState<Bot | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(null);

  // Dynamic Relationship & Mood State
  const [relationshipScore, setRelationshipScore] = useState<number>(50);
  const [currentMood, setCurrentMood] = useState<string>('พร้อมฟังเสมอ');
  const [expandedThoughtId, setExpandedThoughtId] = useState<string | null>(null);

  // Menu & Creator State
  const [isBotMenuOpen, setIsBotMenuOpen] = useState(false);
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);

  // Creator Form State
  const [newBotName, setNewBotName] = useState('');
  const [newBotAvatar, setNewBotAvatar] = useState('🦭');
  const [newBotPersonality, setNewBotPersonality] = useState('');
  const [newBotSpeechStyle, setNewBotSpeechStyle] = useState('');
  const [newBotLikes, setNewBotLikes] = useState('');
  const [newBotBoundaries, setNewBotBoundaries] = useState('');
  const [newBotTemp, setNewBotTemp] = useState(0.7);
  const [isCreatingBot, setIsCreatingBot] = useState(false);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome-msg',
      sender_type: 'bot',
      content: 'สวัสดีวันสบายๆ ยามเช้ากลางทะเลนะคะ~ วันนี้มีเรื่องอะไรอยากเล่าให้ฟังหรือเปล่าเอ่ย? 🐚✨',
      created_at: new Date().toISOString(),
    },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [modelUsed, setModelUsed] = useState<string>('gemini-2.0-flash');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Initialize Supabase Auth Session
  useEffect(() => {
    async function initAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setAuthToken(session.access_token);
      } else {
        const { data: authRes } = await supabase.auth.signInAnonymously();
        if (authRes.session) {
          setAuthToken(authRes.session.access_token);
        }
      }
    }
    initAuth();
  }, []);

  // 2. Fetch Available Bots
  useEffect(() => {
    async function loadBots() {
      try {
        const res = await fetch(`${API_BASE}/api/bots`);
        if (res.ok) {
          const data = await res.json();
          if (data.bots && data.bots.length > 0) {
            setBots(data.bots);
            setSelectedBot(data.bots[0]);
          }
        }
      } catch (err) {
        console.warn('Backend API offline, using fallback bot data:', err);
        const fallbackBot: Bot = {
          id: 'bbedc638-844b-4af3-87ef-24290fcfa735',
          name: 'น้องพะยูน 🌊',
          avatar_url: '🦭',
          personality: 'เพื่อนสนิทที่คอยฟังและให้กำลังใจอย่างนุ่มนวล ชอบฟังเรื่องราวทะเลยามเช้า',
        };
        setBots([fallbackBot]);
        setSelectedBot(fallbackBot);
      }
    }
    loadBots();
  }, []);

  // 3. Create Real Chat Session when Selected Bot changes
  useEffect(() => {
    async function createOrInitChat() {
      if (!selectedBot || !authToken) return;

      try {
        const res = await fetch(`${API_BASE}/api/chats`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ botId: selectedBot.id }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.chatId) {
            setActiveChatId(data.chatId);
            setRelationshipScore(data.chat?.relationship_score ?? 50);
            setCurrentMood(data.chat?.current_mood || 'พร้อมฟังเสมอ');
            setMessages([
              {
                id: `welcome-${Date.now()}`,
                sender_type: 'bot',
                content: `สวัสดีค่ะ! คุณกำลังคุยกับ ${selectedBot.name} อยู่ในขณะนี้นะคะ 🐚✨`,
                created_at: new Date().toISOString(),
              },
            ]);
          }
        }
      } catch (err) {
        console.warn('Failed to create real chat row:', err);
      }
    }

    createOrInitChat();
  }, [selectedBot, authToken]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // 4. Send Message using Real chatId UUID & Auth Bearer Token
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || isLoading || !selectedBot || !activeChatId || !authToken) return;

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
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          chatId: activeChatId,
          botId: selectedBot.id,
          message: userText,
        }),
      });

      if (!res.ok) throw new Error('API server unreachable');

      const data = await res.json();
      setMessages((prev) => [...prev, data.message]);

      if (data.relationship) {
        setRelationshipScore(data.relationship.score);
        setCurrentMood(data.relationship.mood);
      }
      if (data.model_used) {
        setModelUsed(data.model_used);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender_type: 'bot',
          content: '⚠️ ไม่สามารถเชื่อมต่อกับ Elysia Backend Server (http://localhost:3001) ได้ โปรดตรวจสอบว่ารัน `npm run dev` ในโฟลเดอร์หลักแล้วหรือยังนะครับ',
          created_at: new Date().toISOString(),
        },
      ]);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
  };

  // 5. Handle Custom Bot Creation ("สร้างตัวละครเฉพาะ")
  const handleCreateCustomBot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBotName.trim() || !newBotPersonality.trim() || !authToken || isCreatingBot) return;

    setIsCreatingBot(true);
    try {
      const res = await fetch(`${API_BASE}/api/bots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          name: newBotName.trim(),
          avatar_url: newBotAvatar,
          personality: newBotPersonality.trim(),
          speech_style: newBotSpeechStyle.trim(),
          likes_dislikes: newBotLikes.trim(),
          boundaries: newBotBoundaries.trim(),
          temperature: newBotTemp,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.bot) {
          setBots((prev) => [data.bot, ...prev]);
          setSelectedBot(data.bot);
          setIsCreatorOpen(false);
          setIsBotMenuOpen(false);
          setNewBotName('');
          setNewBotPersonality('');
          setNewBotSpeechStyle('');
          setNewBotLikes('');
          setNewBotBoundaries('');
        }
      }
    } catch (err) {
      console.error('Failed to create bot:', err);
    }
    setIsCreatingBot(false);
  };

  const rank = getRelationshipRank(relationshipScore);

  return (
    <div className="page-shell">
      <div className="desk">
        {/* Washi Tapes for Tablet/Desktop Backdrop */}
        <div className="tape tape-left"></div>
        <div className="tape tape-right"></div>

        {/* Main Phone / Sketchbook Frame */}
        <div className="phone-frame">
          {/* Subtle floating ocean doodles */}
          <svg className="doodle" style={{ top: '120px', left: '10px', width: '34px' }} viewBox="0 0 40 40">
            <path d="M4 30 C10 10, 30 10, 36 30" stroke="#146C8C" strokeWidth="2.5" fill="none" strokeLinecap="round" />
            <path d="M8 32 C13 16, 27 16, 32 32" stroke="#146C8C" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity=".6" />
          </svg>
          <svg className="doodle" style={{ top: '260px', right: '14px', width: '30px' }} viewBox="0 0 40 40">
            <circle cx="20" cy="20" r="4" fill="#FF8B6B" />
            <circle cx="10" cy="14" r="2.5" fill="#FF8B6B" />
            <circle cx="30" cy="10" r="2" fill="#FF8B6B" />
            <circle cx="32" cy="26" r="3" fill="#FF8B6B" />
          </svg>
          <svg className="doodle" style={{ bottom: '150px', left: '16px', width: '38px' }} viewBox="0 0 50 50">
            <path d="M10 40 L25 8 L40 40 Z" stroke="#146C8C" strokeWidth="2" fill="none" strokeLinejoin="round" />
            <path d="M25 8 L25 40" stroke="#146C8C" strokeWidth="1.5" />
            <path d="M10 40 L25 40 L40 40" stroke="#146C8C" strokeWidth="1.5" />
          </svg>

          {/* 🌊 Ocean Sketchbook Header */}
          <header className="chat-header">
            <div className="header-row">
              <div className="bot-id">
                <div className="avatar-frame">
                  {selectedBot?.avatar_url || '🦭'}
                </div>
                <div>
                  <div className="bot-name">{selectedBot?.name || 'น้องพะยูน 🌊'}</div>
                  <div className="status-tag">
                    <span className="status-dot"></span>
                    <span>{currentMood}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  className="switch-btn"
                  onClick={() => setIsBotMenuOpen(!isBotMenuOpen)}
                >
                  <span>สลับเพื่อนคุย</span>
                  <svg width="10" height="10" viewBox="0 0 10 10">
                    <path d="M1 3 L5 7 L9 3" stroke="#2A4750" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Dropdown Menu for Switching Bots & Custom Creator */}
            <div className={`bot-menu ${isBotMenuOpen ? 'open' : ''}`}>
              {bots.map((b) => (
                <div
                  key={b.id}
                  className="bot-option"
                  onClick={() => {
                    setSelectedBot(b);
                    setIsBotMenuOpen(false);
                  }}
                >
                  <span className="mini-avatar">{b.avatar_url || '🦭'}</span>
                  <span className="truncate">{b.name}</span>
                </div>
              ))}
              <div
                className="bot-option text-sky-800 bg-sky-50 border-t border-sky-100 font-bold mt-1 pt-2"
                onClick={() => {
                  setIsBotMenuOpen(false);
                  setIsCreatorOpen(true);
                }}
              >
                <span className="mini-avatar bg-sky-200">✨</span>
                <span>+ สร้างตัวละครเฉพาะ</span>
              </div>
            </div>

            {/* ❤️ Dynamic Relationship & Affection Progress Bar */}
            <div className="mt-2.5 bg-white/90 rounded-xl p-2 border-2 border-[#2A4750] shadow-[2px_2px_0_rgba(42,71,80,0.15)]">
              <div className="flex items-center justify-between text-xs font-semibold text-[#2A4750] mb-1 px-1 font-['Mali']">
                <span className="flex items-center space-x-1">
                  <span>{rank.icon}</span>
                  <span>{rank.name}</span>
                </span>
                <span>{relationshipScore}%</span>
              </div>
              <div className="w-full h-2 bg-[#F6E9C9] rounded-full overflow-hidden border border-[#2A4750]">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${rank.color} transition-all duration-700`}
                  style={{ width: `${relationshipScore}%` }}
                />
              </div>
            </div>

            {/* Decorative Wave Divider */}
            <svg className="wave-divider" viewBox="0 0 400 26" preserveAspectRatio="none">
              <path d="M0 10 Q 20 22 40 10 T 80 10 T 120 10 T 160 10 T 200 10 T 240 10 T 280 10 T 320 10 T 360 10 T 400 10 V26 H0 Z" fill="#FBEFD9" />
              <path d="M0 10 Q 20 22 40 10 T 80 10 T 120 10 T 160 10 T 200 10 T 240 10 T 280 10 T 320 10 T 360 10 T 400 10" stroke="#2A4750" strokeWidth="1.6" fill="none" opacity=".5" />
            </svg>
          </header>

          {/* Model Cascade Info Sub-bar */}
          <div className="px-4 py-1.5 bg-[#F3E3C0]/90 border-b border-[#D9C79E] flex items-center justify-between text-[11px] text-[#2A4750] font-['Mali'] font-semibold">
            <span className="flex items-center space-x-1">
              <span>🐚</span>
              <span>โมเดลประมวลผล: <b>{modelUsed}</b></span>
            </span>
            <span className="text-[#146C8C]">Gemini Cascade</span>
          </div>

          {/* 💬 Chat Messages Main Stream */}
          <main className="chat-main">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`msg-row ${msg.sender_type === 'user' ? 'user' : 'bot'}`}
              >
                <div className="bubble">
                  {/* Collapsible Inner Thought Accordion for Bot Messages */}
                  {msg.sender_type === 'bot' && msg.inner_thought && (
                    <div className="mb-2 pb-2 border-b border-[#2A4750]/20 font-['Mali']">
                      <button
                        type="button"
                        onClick={() => setExpandedThoughtId(expandedThoughtId === msg.id ? null : msg.id)}
                        className="flex items-center space-x-1 text-[11px] font-bold text-[#146C8C] bg-[#D8F0F2] px-2 py-0.5 rounded-lg border border-[#2A4750] cursor-pointer hover:bg-white transition-all shadow-[1px_1px_0_rgba(42,71,80,0.2)]"
                      >
                        <span>🧠 ความคิดในใจบอท</span>
                        <span>{expandedThoughtId === msg.id ? '▲' : '▼'}</span>
                      </button>
                      {expandedThoughtId === msg.id && (
                        <div className="mt-1.5 p-2 bg-[#FBEFD9] border border-[#2A4750] rounded-xl text-[11px] text-[#2A4750] italic leading-snug">
                          {msg.inner_thought}
                        </div>
                      )}
                    </div>
                  )}

                  {msg.content}
                </div>
                <div className="msg-time">
                  {new Date(msg.created_at).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            ))}

            {/* Sailboat Typing Indicator */}
            {isLoading && (
              <div className="typing-boat">
                <svg width="18" height="18" viewBox="0 0 30 30">
                  <path d="M4 20 L26 20 L22 26 L8 26 Z" fill="#FBEFD9" stroke="#2A4750" strokeWidth="1.6" />
                  <path d="M15 20 L15 4 L23 20" fill="#fff" stroke="#2A4750" strokeWidth="1.4" />
                </svg>
                <span>กำลังไตร่ตรองความคิดและอารมณ์...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </main>

          {/* 📥 Footer Input Form */}
          <footer className="chat-footer">
            <form onSubmit={handleSendMessage} className="input-form">
              <input
                type="text"
                className="msg-input"
                placeholder="พิมพ์เล่าให้ฟังหน่อยสิ..."
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                autoComplete="off"
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!inputMessage.trim() || isLoading || !activeChatId}
                aria-label="ส่งข้อความ"
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M4 12 L20 5 L14 20 L11 13 L4 12 Z" fill="#fff" stroke="#fff" strokeWidth="0.5" strokeLinejoin="round" />
                </svg>
              </button>
            </form>
          </footer>
        </div>
      </div>

      {/* 🎭 Custom Character Creator Studio Modal */}
      {isCreatorOpen && (
        <div className="fixed inset-0 bg-[#2A4750]/60 backdrop-blur-sm z-50 flex justify-center items-end sm:items-center p-0 sm:p-4">
          <div className="bg-[#FBEFD9] border-2.5 border-[#2A4750] w-full max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-[6px_8px_0_rgba(42,71,80,0.25)] flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 font-['Sarabun']">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#D8F0F2] to-[#BFE3EA] px-5 py-4 flex items-center justify-between border-b-2 border-[#2A4750]">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">✨</span>
                <h2 className="font-['Mali'] text-lg font-bold text-[#2A4750]">สร้างตัวละครเฉพาะ</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsCreatorOpen(false)}
                className="w-8 h-8 rounded-full bg-white border-2 border-[#2A4750] flex items-center justify-center text-[#2A4750] font-bold text-sm shadow-[1px_1px_0_rgba(42,71,80,0.2)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleCreateCustomBot} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs text-[#2A4750]">
              {/* Avatar Selector */}
              <div>
                <label className="block font-['Mali'] font-bold text-sm text-[#2A4750] mb-1.5">ไอคอนตัวละคร (Avatar)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {AVATAR_PRESETS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewBotAvatar(emoji)}
                      className={`w-9 h-9 rounded-xl text-xl flex items-center justify-center border-2 transition-all cursor-pointer ${
                        newBotAvatar === emoji
                          ? 'border-[#2A4750] bg-[#D8F0F2] shadow-[2px_2px_0_rgba(42,71,80,0.3)] scale-105'
                          : 'border-[#2A4750]/30 bg-white hover:bg-[#F3E3C0]'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot Name */}
              <div>
                <label className="block font-['Mali'] font-bold text-[#2A4750] mb-1">ชื่อตัวละคร *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น น้องกะพรุน 🎐"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  className="w-full bg-white border-2 border-[#2A4750] rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#146C8C]/30"
                />
              </div>

              {/* Personality */}
              <div>
                <label className="block font-['Mali'] font-bold text-[#2A4750] mb-1">บุคลิกและประวัติ (Personality) *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="เช่น ขี้เล่น กวนๆ รักทะเล แอบขี้งอนเวลาโดนขัดใจ"
                  value={newBotPersonality}
                  onChange={(e) => setNewBotPersonality(e.target.value)}
                  className="w-full bg-white border-2 border-[#2A4750] rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#146C8C]/30 resize-none"
                />
              </div>

              {/* Speech Style */}
              <div>
                <label className="block font-['Mali'] font-bold text-[#2A4750] mb-1">สไตล์การพูด (Speech Style)</label>
                <input
                  type="text"
                  placeholder="เช่น พูดจาน่ารัก มีคำติดปากว่า 'เหวออ~', 'น้าาๆ'"
                  value={newBotSpeechStyle}
                  onChange={(e) => setNewBotSpeechStyle(e.target.value)}
                  className="w-full bg-white border-2 border-[#2A4750] rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#146C8C]/30"
                />
              </div>

              {/* Likes & Dislikes */}
              <div>
                <label className="block font-['Mali'] font-bold text-[#2A4750] mb-1">สิ่งที่ชอบ / ไม่ชอบ (Likes & Dislikes)</label>
                <input
                  type="text"
                  placeholder="เช่น ชอบกินชานมไข่มุก ไม่ชอบผักชี"
                  value={newBotLikes}
                  onChange={(e) => setNewBotLikes(e.target.value)}
                  className="w-full bg-white border-2 border-[#2A4750] rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#146C8C]/30"
                />
              </div>

              {/* Boundaries */}
              <div>
                <label className="block font-['Mali'] font-bold text-[#2A4750] mb-1">ขอบเขตและกฎระเบียบ (Boundaries)</label>
                <input
                  type="text"
                  placeholder="เช่น ไม่พูดจารุนแรง สุภาพอ่อนโยน"
                  value={newBotBoundaries}
                  onChange={(e) => setNewBotBoundaries(e.target.value)}
                  className="w-full bg-white border-2 border-[#2A4750] rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-[#146C8C]/30"
                />
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex justify-between items-center mb-1 font-['Mali'] font-bold">
                  <span>ระดับความสร้างสรรค์ (Creativity): {newBotTemp}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={newBotTemp}
                  onChange={(e) => setNewBotTemp(parseFloat(e.target.value))}
                  className="w-full accent-[#146C8C] cursor-pointer"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCreatorOpen(false)}
                  className="flex-1 py-2.5 bg-white border-2 border-[#2A4750] rounded-xl font-['Mali'] font-bold text-[#2A4750] hover:bg-[#F3E3C0] text-xs cursor-pointer shadow-[2px_2px_0_rgba(42,71,80,0.2)]"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isCreatingBot || !newBotName.trim() || !newBotPersonality.trim()}
                  className="flex-1 py-2.5 bg-[#FF8B6B] border-2 border-[#2A4750] text-white rounded-xl font-['Mali'] font-bold text-xs hover:opacity-90 disabled:opacity-40 shadow-[2px_2px_0_rgba(42,71,80,0.3)] cursor-pointer transition-all active:scale-95"
                >
                  {isCreatingBot ? 'กำลังสร้าง...' : 'สร้างและเริ่มคุย ✨'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
