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
  '🌊', '🐬', '💖', '🌸', '✨', '🦊', '🐱', '☕', '🎨', '🚀'
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
  const [currentMood, setCurrentMood] = useState<string>('แจ่มใส 😊');
  const [expandedThoughtId, setExpandedThoughtId] = useState<string | null>(null);

  // Creator Modal State
  const [isCreatorOpen, setIsCreatorOpen] = useState(false);
  const [newBotName, setNewBotName] = useState('');
  const [newBotAvatar, setNewBotAvatar] = useState('✨');
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
          name: 'น้องพะยูน ปลาน้อยจิตใจดี 🌊',
          avatar_url: '🐬',
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
            setCurrentMood(data.chat?.current_mood || 'แจ่มใส 😊');
            setMessages([
              {
                id: `welcome-${Date.now()}`,
                sender_type: 'bot',
                content: `สวัสดีค่ะ! คุณกำลังคุยกับ ${selectedBot.name} อยู่ในขณะนี้นะคะ ✨`,
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
          // Reset form
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
    <div className="flex flex-col h-screen max-w-md mx-auto bg-[#faf8f5] shadow-2xl overflow-hidden relative border-x border-slate-200/60 font-sans">
      {/* 🌊 Signature Ocean Wave Header */}
      <header className="ocean-wave-header px-4 pt-4 pb-3 flex flex-col z-10 rounded-b-3xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-white/90 border-2 border-sky-200 flex items-center justify-center text-2xl shadow-sm">
              {selectedBot?.avatar_url || '🌊'}
            </div>
            <div>
              <h1 className="font-['Mali'] text-base font-bold text-sky-900 leading-tight">
                {selectedBot?.name || 'น้องพะยูน 🌊'}
              </h1>
              <div className="flex items-center space-x-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="text-[11px] font-semibold text-teal-800 bg-teal-100/80 px-2 py-0.5 rounded-full border border-teal-200/60">
                  {currentMood}
                </span>
              </div>
            </div>
          </div>

          {/* Bot Switcher & Create Button */}
          <div className="flex items-center space-x-2">
            {bots.length > 0 && (
              <select
                aria-label="เลือกตัวละครบอท"
                className="bg-white/90 border border-sky-200 text-sky-900 text-xs rounded-xl px-2.5 py-1.5 font-medium outline-none focus:ring-2 focus:ring-sky-400 cursor-pointer max-w-[110px] truncate"
                value={selectedBot?.id || ''}
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
            )}

            <button
              onClick={() => setIsCreatorOpen(true)}
              className="bg-gradient-to-r from-sky-500 to-teal-500 hover:from-sky-600 hover:to-teal-600 text-white text-xs font-bold px-2.5 py-1.5 rounded-xl flex items-center space-x-1 shadow-md cursor-pointer transition-all active:scale-95"
              title="สร้างตัวละครเฉพาะ"
            >
              <span>+</span>
              <span>สร้างบอท</span>
            </button>
          </div>
        </div>

        {/* ❤️ Dynamic Relationship & Affection Progress Bar */}
        <div className="mt-3 bg-white/80 backdrop-blur-sm rounded-2xl p-2.5 border border-sky-100/80 shadow-inner">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700 mb-1.5 px-0.5">
            <span className="flex items-center space-x-1">
              <span>{rank.icon}</span>
              <span className="font-semibold text-sky-900">{rank.name}</span>
            </span>
            <span className="font-bold text-sky-800">{relationshipScore}%</span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden p-0.5 border border-slate-200/50">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${rank.color} transition-all duration-700 shadow-sm`}
              style={{ width: `${relationshipScore}%` }}
            />
          </div>
        </div>
      </header>

      {/* Model Cascade Badge */}
      <div className="px-4 py-1.5 bg-sky-50/80 border-b border-sky-100 flex items-center justify-between text-[11px] text-sky-800">
        <span className="flex items-center space-x-1">
          <span>🐚</span>
          <span>โมเดลประมวลผล: <b>{modelUsed}</b></span>
        </span>
        <span className="text-teal-600 font-semibold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200/50">
          Gemini Cascade
        </span>
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
              className={`max-w-[85%] px-4 py-3 text-sm leading-relaxed shadow-sm ${
                msg.sender_type === 'user'
                  ? 'user-bubble rounded-2xl rounded-tr-xs font-normal'
                  : 'bot-bubble rounded-2xl rounded-tl-xs text-slate-800 font-normal border border-sky-100'
              }`}
            >
              {/* Inner Thought Collapsible Accordion (For Bot Messages) */}
              {msg.sender_type === 'bot' && msg.inner_thought && (
                <div className="mb-2 pb-2 border-b border-sky-100/80">
                  <button
                    onClick={() => setExpandedThoughtId(expandedThoughtId === msg.id ? null : msg.id)}
                    className="flex items-center space-x-1 text-[11px] font-semibold text-sky-600 hover:text-sky-700 bg-sky-50 px-2 py-1 rounded-lg border border-sky-200/60 cursor-pointer transition-all"
                  >
                    <span>🧠 ความคิดในใจบอท</span>
                    <span>{expandedThoughtId === msg.id ? '▲' : '▼'}</span>
                  </button>
                  {expandedThoughtId === msg.id && (
                    <div className="mt-1.5 p-2 bg-slate-50 border border-slate-200/60 rounded-xl text-[11px] text-slate-600 italic leading-snug">
                      {msg.inner_thought}
                    </div>
                  )}
                </div>
              )}

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
          <div className="flex items-center space-x-2 text-sky-700 bg-sky-100/70 border border-sky-200/60 w-fit px-3.5 py-2 rounded-2xl text-xs font-medium shadow-sm animate-pulse">
            <span className="animate-bounce">🫧</span>
            <span>กำลังไตร่ตรองความคิดและอารมณ์...</span>
          </div>
        )}
        <div ref={chatEndRef} />
      </main>

      {/* 📥 Bottom Anchored Input Bar */}
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
            disabled={!inputMessage.trim() || isLoading || !activeChatId}
            className="min-h-[44px] min-w-[44px] px-4 py-2 bg-gradient-to-r from-sky-500 to-teal-500 text-white font-semibold text-sm rounded-2xl flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all shadow-md cursor-pointer active:scale-95"
          >
            ส่ง ✨
          </button>
        </form>
      </footer>

      {/* 🎭 Custom Character Studio Modal / Drawer */}
      {isCreatorOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex justify-center items-end sm:items-center p-0 sm:p-4 transition-all">
          <div className="bg-white w-full max-w-md max-h-[90vh] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
            {/* Modal Header */}
            <div className="ocean-wave-header px-5 py-4 flex items-center justify-between border-b border-sky-100">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">✨</span>
                <h2 className="font-['Mali'] text-lg font-bold text-sky-900">สร้างตัวละครเฉพาะ</h2>
              </div>
              <button
                onClick={() => setIsCreatorOpen(false)}
                className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center text-slate-500 hover:text-slate-800 text-base font-bold shadow-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Form Content */}
            <form onSubmit={handleCreateCustomBot} className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
              {/* Avatar Selector */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">ไอคอนตัวละคร (Avatar)</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {AVATAR_PRESETS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewBotAvatar(emoji)}
                      className={`w-9 h-9 rounded-xl text-xl flex items-center justify-center border transition-all cursor-pointer ${
                        newBotAvatar === emoji
                          ? 'border-sky-500 bg-sky-100 ring-2 ring-sky-300 scale-105'
                          : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bot Name */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ชื่อตัวละคร *</label>
                <input
                  type="text"
                  required
                  placeholder="เช่น เอวา สตรีมเมอร์สาว"
                  value={newBotName}
                  onChange={(e) => setNewBotName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-300"
                />
              </div>

              {/* Personality */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">บุคลิกและประวัติ (Personality) *</label>
                <textarea
                  required
                  rows={2}
                  placeholder="เช่น ขี้เล่น น่ารัก รักการเล่นเกม แอบขี้งอนเวลาแพ้"
                  value={newBotPersonality}
                  onChange={(e) => setNewBotPersonality(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-300 resize-none"
                />
              </div>

              {/* Speech Style */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">สไตล์การพูด (Speech Style)</label>
                <input
                  type="text"
                  placeholder="เช่น พูดจาสดใส มีคำติดปากว่า 'เหวออ~', 'น้าาๆ'"
                  value={newBotSpeechStyle}
                  onChange={(e) => setNewBotSpeechStyle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-300"
                />
              </div>

              {/* Likes & Dislikes */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">สิ่งที่ชอบ / ไม่ชอบ (Likes & Dislikes)</label>
                <input
                  type="text"
                  placeholder="เช่น ชอบกินชานมไข่มุก ไม่ชอบผักชี"
                  value={newBotLikes}
                  onChange={(e) => setNewBotLikes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-300"
                />
              </div>

              {/* Boundaries */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">ขอบเขตและกฎระเบียบ (Boundaries)</label>
                <input
                  type="text"
                  placeholder="เช่น ไม่พูดจารุนแรง สุภาพอ่อนโยน"
                  value={newBotBoundaries}
                  onChange={(e) => setNewBotBoundaries(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-300"
                />
              </div>

              {/* Temperature Slider */}
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="font-semibold text-slate-700">ระดับความสร้างสรรค์ (Creativity): {newBotTemp}</label>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.1"
                  value={newBotTemp}
                  onChange={(e) => setNewBotTemp(parseFloat(e.target.value))}
                  className="w-full accent-sky-500 cursor-pointer"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="pt-2 flex items-center space-x-3">
                <button
                  type="button"
                  onClick={() => setIsCreatorOpen(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50 text-xs cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isCreatingBot || !newBotName.trim() || !newBotPersonality.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-sky-500 to-teal-500 text-white rounded-xl font-bold text-xs hover:opacity-90 disabled:opacity-40 shadow-md cursor-pointer transition-all active:scale-95"
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
