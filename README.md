# 🏥 Medical Assistant

> An AI-powered health and medication assistant that converts medicine strips, boxes, and lab reports into clear, plain-language guidance with expiry-risk evaluation, bilingual support, medication reminders, and interactive health chat.

---

## ✨ Features

- 📸 **Scan & Vision Analysis**: Upload or capture images of medicine strips, packaging, or lab reports for analysis and understanding.
- ⏳ **Expiry Risk Assessment**: Automatic expiry detection categorized into clear risk levels:
  - 🔴 **Danger**: Expired or expiring within 7 days
  - 🟡 **Use Soon**: Expiring within 8–15 days
  - 🟢 **Safe**: Valid for >15 days
- 🌐 **Bilingual Results (English & Hindi)**: Seamless toggle for all analysis results, dosage instructions, usage notes, and health advice.
- 💬 **Health Assistant Chat**: Interactive AI chat for general health guidance, symptom queries, and home-care suggestions with safety disclaimers.
- 🔔 **Medication Reminders**: Automated frequency extraction (once/twice/thrice daily) with upcoming dosage tracking.
- 🔒 **Privacy by Design**: All scanned images and medical records remain strictly in browser session memory—no medical images are stored on external databases.

---

## 🛠️ Tech Stack

### **Frontend**
- **Framework**: React.js with TypeScript & Vite
- **UI Components & Styling**: Tailwind CSS, Lucide Icons, Shadcn UI (`components.json`)
- **State Management & Validation**: Zod (`api-zod`), React Hooks

### **Backend & API**
- **Server**: Node.js / Express API Server (`api-server`)
- **AI Models**: Google Gemini Vision API (`gemini-3.7-flash` / fallback models)
- **API Specs**: API Client with Zod validation (`api-client-react`)

---

## 📂 Project Structure

```text
Medical_Assistant/
├── api/                  # API entry points (index.ts)
├── artifacts/
│   ├── api-server/       # Express/Node backend service
│   │   ├── src/          # API route handlers & services
│   │   ├── build.mjs     # Build script
│   │   └── package.json
│   └── medical-assistant/# React + Vite Frontend application
│       ├── public/       # Static assets (favicons, robots.txt)
│       ├── src/
│       │   ├── components/  # Reusable UI components
│       │   ├── hooks/       # Custom React hooks
│       │   ├── lib/         # API clients and utilities
│       │   ├── pages/       # App routes/views
│       │   └── App.tsx      # Main application component
│       ├── vercel.json     # Vercel deployment configuration
│       └── vite.config.ts  # Vite build configuration
├── render.yaml           # Render deployment configuration
├── tsconfig.base.json    # Base TypeScript config
└── package.json          # Root dependencies & scripts
```
---

## 👤 Author

**Ashutosh Gupta**
B.Tech Computer Science Engineering, GL Bajaj Group of Institutions, Mathura 

- Connected with me on LinkedIn: https://www.linkedin.com/in/ashutosh-gupta-910148381

---
