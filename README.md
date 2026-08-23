# MarksMaster - Student PDF Marks Management System
### Govt. SHMM Degree College Anantnag

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?logo=tailwind-css)
![Vite](https://img.shields.io/badge/Vite-6.2-646CFF.svg?logo=vite)
![Express](https://img.shields.io/badge/Express-4.21-000000.svg?logo=express)

**MarksMaster** is an offline-first, client-side & full-stack academic marks normalization, student identity registry, and official PDF report card management system built for **Govt. SHMM Degree College Anantnag**.

---

## 🌟 Key Features

### 📄 Multi-Format PDF Marksheet Parsing & Normalization
- **Local PDF Parsing**: Extracts student rolls, subjects, max marks, and marks obtained directly inside the browser using `pdfjs-dist`.
- **Subject Alias Normalization**: Automatically maps variations of subject titles (e.g., *IT*, *Information Tech*, *Comp Sci*) to standard registry subjects.
- **Unresolved Records Resolution Queue**: Review and manually resolve unmatched subjects or invalid student entries without losing raw data.

### 📜 Official PDF Report Card & Bulk PDF Generation
- **Official Institutional Branding**: Renders official PDF report cards complete with the college header, emblem/logo, watermark, and golden cursive typography for **Govt. SHMM Degree College Anantnag**.
- **Single Student Dossier Download**: Generate high-precision, printable single-page PDF marksheets with performance grades, total marks, percentages, and signature lines.
- **Bulk PDF Export**: Export all student report cards (or a custom filtered/selected subset) merged into a single multi-page PDF document.
- **CSV Matrix Export**: Download consolidated cross-subject marks matrices for Excel and administrative reporting.

### 🤖 Gemini AI Academic Insights & Predictor
- **Secure Server Proxy**: Integrated `@google/genai` API running behind a secure Express backend (`/api/gemini/*`). Your Gemini API key is never exposed to the client browser.
- **Class Analytics & Insights**: Automated qualitative class feedback, performance distribution, pass/fail trends, and intervention recommendations.

### 💾 Local-First Persistence & Backup
- **IndexedDB Storage**: Complete offline support. Data persists locally across browser sessions with zero database upkeep required.
- **JSON Backup & Restore**: Export full database snapshots (students, subjects, marks, import logs) and restore them anytime.
- **Light & Dark Theme**: Responsive UI designed for both dark mode and high-contrast light mode environments.

---

## 🛠️ Tech Stack

- **Frontend**: React 19, TypeScript, Tailwind CSS v4, Lucide React Icons, Motion (Framer Motion)
- **Backend**: Node.js, Express 4, `tsx` / `esbuild`
- **PDF Engine**: `jsPDF`, `jspdf-autotable`, `pdfjs-dist`
- **AI Integration**: Google Gen AI SDK (`@google/genai`)
- **Storage**: Browser IndexedDB Engine

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/your-username/marksmaster.git
   cd marksmaster
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Environment Variables**:
   Copy `.env.example` to `.env` (or configure in your deployment platform):
   ```bash
   cp .env.example .env
   ```
   Add your Gemini API key (optional for AI insights feature):
   ```env
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

4. **Run the Development Server**:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## 📦 Production Build & Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Runs the server and Vite middleware in development mode on port 3000 |
| `npm run build` | Builds static assets with Vite and bundles Express backend via `esbuild` into `dist/server.cjs` |
| `npm run start` | Runs the production CommonJS bundled server (`node dist/server.cjs`) |
| `npm run lint` | Runs TypeScript type checking (`tsc --noEmit`) |
| `npm run clean` | Cleans up production build output directories |

---

## 🔒 Security & Deployment

### API Key Protection
This application follows strict **full-stack security best practices**:
- All Gemini AI requests are routed through Express backend endpoints (`/api/gemini/insights`).
- `GEMINI_API_KEY` is kept exclusively on the server side (`process.env.GEMINI_API_KEY`) and is **never** prefixed with `VITE_` or sent to the browser client.

### Deploying to Vercel
1. Push your code to GitHub.
2. Import the project into **Vercel**.
3. Set the **Build Command** to `npm run build` and **Start Command** to `npm run start`.
4. Add `GEMINI_API_KEY` under **Project Settings → Environment Variables**.
5. Click **Deploy**.

---

## 🏫 Institution
**Govt. SHMM Degree College Anantnag**  
Official Academic Performance & Marks Normalization Registry System.
