# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

คนทั่วไปที่อยากมีเพื่อนคุยหรือมีเพื่อน AI ไว้คุยเล่น ผ่อนคลาย ไม่เหงา — ไม่ใช่นักเขียนหรือนักเล่นเกมโดยเฉพาะ ใช้ทั้งมือถือและเดสก์ท็อปในสัดส่วนที่ใกล้เคียงกัน

## Product Purpose

แอปแชทกับตัวละคร AI ที่มีบุคลิกชัดเจน (เช่น น้องพะยูน, น้องกะพรุน) ผ่านระบบ persona ที่กำหนดได้ ผู้ใช้สามารถเลือกตัวละครที่ถูกใจและพูดคุยโต้ตอบได้อย่างเป็นธรรมชาติ  
ความสำเร็จ = ผู้ใช้รู้สึกว่ามีเพื่อน ไม่ใช่แค่แชทบอท

## Positioning

ระบบ persona-based chat ที่ผสานตัวละครที่มีบุคลิกจริง กับ Gemini model cascade (ใช้ Flash Lite ก่อน ยกระดับเมื่อจำเป็น) เพื่อประสบการณ์ที่อบอุ่นและประหยัดต้นทุน — แตกต่างจาก chatbot ทั่วไปที่ไม่มีตัวตน

## Operating Context

- ใช้บน Next.js (web frontend) + Elysia backend + Supabase (DB + Auth) + Google Gemini API
- ตัวละครบอทถูกเก็บใน Supabase และโหลดจาก `/api/bots`
- มี fallback bot ในกรณี backend offline
- ใช้ Gemini model cascade: เริ่มจาก `gemini-2.5-flash-lite` แสดงผลที่ header
- รองรับทั้ง mobile และ desktop เท่าๆ กัน (Mobile-first layout, max-width 420-448px centered)

## Capabilities and Constraints

- **ทำได้:** เลือกตัวละครบอท, พูดคุยโต้ตอบ, บอทมี inner personality และ system prompt ที่กำหนดได้
- **ข้อจำกัดปัจจุบัน:** ยังไม่มีระบบ auth ผู้ใช้ / session จริงในฝั่ง frontend
- **Chat session ID** ปัจจุบันใช้ค่า hardcode `'active-user-session'` (MVP stage)
- **Stack:** Next.js (App Router, TypeScript, Tailwind), Elysia (backend), Supabase, Gemini

## Brand Commitments

**สไตล์ Ocean Sketchbook** — กระดาษสีครีมอบอุ่น, สีทะเล (sea-deep `#146C8C`, sea-pale `#D8F0F2`), สีปะการัง (coral `#FF8B6B`), font Mali (handwritten Thai) + Sarabun (body), stroke ขอบหนา, เงา offset แบบวาดมือ, doodle ลอย, wave divider ระหว่าง header กับ chat  

Reference design: `D:\Downloads\roleplay-chat-redesign.html` — ใช้เป็นทิศทางหลัก ไม่ใช่ทดแทน

ชื่อตัวละครตัวอย่าง: น้องพะยูน 🌊, น้องกะพรุน 🎐 — โทนภาษาอบอุ่น เป็นกันเอง ภาษาไทย

## Evidence on Hand

- `e:\RoleplayChat\web\src\app\page.tsx` — UI ปัจจุบัน (มีอยู่แล้ว แต่ยัง rough)
- `e:\RoleplayChat\web\src\app\globals.css` — CSS ปัจจุบัน (Tailwind base)
- `D:\Downloads\roleplay-chat-redesign.html` — reference design ที่ผู้ใช้ระบุว่าต้องการรักษาสไตล์นี้ไว้

## Product Principles

1. **ตัวละครต้องมีตัวตน** — บอทแต่ละตัวต้องรู้สึกแตกต่างกันจริง ไม่ใช่ chatbot ทั่วไปที่เปลี่ยนแค่ชื่อ
2. **อบอุ่นก่อนฉลาด** — UX ต้องให้ความรู้สึกเป็นมิตร ไม่ใช่ productivity tool
3. **ประหยัดต้นทุนโดยไม่ลดคุณภาพประสบการณ์** — model cascade ทำงานเบื้องหลัง ผู้ใช้ไม่ต้องสน
4. **Mobile ไม่ใช่แค่ responsive** — layout และ interaction ต้องถูกออกแบบมาสำหรับการใช้มือถือจริงๆ (thumb zone, safe area, keyboard handling)
5. **ภาษาและ aesthetic ต้องไปด้วยกัน** — ภาษาไทยอบอุ่น + ดีไซน์ ocean sketchbook ต้องเสริมกัน ไม่ขัดกัน
