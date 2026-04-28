<div align="center">

# ⧉ Code Copier

**Copy code files to your clipboard — formatted and ready for AI prompts.**

A fast, lightweight desktop app built with **Rust + Tauri 2 + React**.  
Browse your project like VS Code, click to copy files or entire folders with relative paths.

[![Built with Tauri](https://img.shields.io/badge/Built_with-Tauri_2-FFC131?style=flat-square&logo=tauri&logoColor=white)](https://v2.tauri.app)
[![Rust](https://img.shields.io/badge/Backend-Rust-B7410E?style=flat-square&logo=rust&logoColor=white)](https://www.rust-lang.org)
[![React](https://img.shields.io/badge/Frontend-React_19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev)
[![License: MIT](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

</div>

---

## 🎯 What It Does

You're working with ChatGPT, Claude, or Copilot and need to paste code files into the conversation. Manually opening files, copying content, and adding file paths is tedious.

**Code Copier solves this in one click:**

| Action | Result in Clipboard |
|---|---|
| Click a **file** | `relative/path/to/file.ts` + full file content |
| Click the ⧉ button on a **folder** | All text files inside, each prefixed with its relative path |

```
src/App.tsx
import React from "react";
// ... full file content

src/main.tsx
import { createRoot } from "react-dom/client";
// ... full file content
```

Paste directly into any AI chat. The model immediately understands your project structure.

---

## ✨ Features

- **📁 VS Code-style file tree** — Browse your project with a familiar expandable directory tree
- **⚡ One-click copy** — Click any file to copy its relative path + content to clipboard
- **📂 Folder batch copy** — Copy all text files in a folder with a single click
- **🔍 Real-time search** — Filter files by name or path instantly
- **🚀 Rust-powered backend** — File I/O and clipboard writes run on background threads; the UI never freezes
- **🧠 Smart filtering** — Automatically skips `node_modules`, `.git`, `target`, `dist`, binary files, images, and other non-code assets
- **📏 Safety limits** — Large folders are blocked before copying to prevent clipboard or system freezes
- **🖥️ Multi-window** — Open multiple windows for different projects (`Ctrl+Shift+N`)
- **🌐 14 Languages** — Chinese, English, Japanese, Korean, French, German, Spanish, Portuguese, Italian, Russian, Polish, Turkish, Hindi, Cantonese
- **🎨 Dark theme** — Beautiful dark UI with glassmorphism design


---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 18
- [Rust](https://www.rust-lang.org/tools/install) (latest stable)
- [Tauri 2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS

### Install & Run

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/code-copier.git
cd code-copier

# Install dependencies
npm install

# Run in development mode
npm run tauri:dev
```

### Build for Production

```bash
npm run tauri:build
```

The installer will be generated in `src-tauri/target/release/bundle/`.

---

## 🏗️ Architecture

```
┌──────────────────────────────────────────────────┐
│                   Tauri Window                   │
│                                                  │
│  ┌─────────────┐  ┌───────────────────────────┐  │
│  │   Sidebar   │  │        Main Content       │  │
│  │             │  │                           │  │
│  │  File Tree  │  │  Status / Stats / Tips    │  │
│  │  (Virtual   │  │                           │  │
│  │   Scroll)   │  │                           │  │
│  │             │  │                           │  │
│  └──────┬──────┘  └───────────────────────────┘  │
│         │  invoke()                              │
├─────────┼────────────────────────────────────────┤
│         ▼         Rust Backend (Tauri 2)         │
│  ┌─────────────────────────────────────────────┐ │
│  │  scan_folder    → Recursive dir walk        │ │
│  │  copy_file      → Read + clipboard write    │ │
│  │  copy_files     → Batch read + clipboard    │ │
│  │                                             │ │
│  │  All file I/O on background threads         │ │
│  │  (spawn_blocking)                           │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|---|---|
| Desktop Shell | Tauri 2 (WebView2 / WebKit) |
| Backend | Rust (std::fs, arboard) |
| Frontend | React 19, TypeScript, Vite |
| Internationalization | i18next + react-i18next |
| Styling | Pure CSS (no framework) |

---

## 🛡️ Safety & Performance

| Mechanism | Detail |
|---|---|
| **Max file size** | Single file copy limited to 20 MB |
| **Max folder files** | Folder batch copy limited to 300 files |
| **Max folder source size** | 12 MB total source bytes before blocking |
| **Max clipboard payload** | 16 MB assembled text payload |
| **Binary detection** | Files with null bytes in first 8 KB are skipped |
| **Extension blocklist** | Images, videos, archives, Office docs, `.lock`, `.map` auto-skipped |
| **Heavy dir skip** | `node_modules`, `.git`, `target`, `dist`, `build`, `__pycache__`, etc. |
| **Virtual scrolling** | File tree renders only visible rows — handles 100K+ files smoothly |
| **Background threads** | All file reads and clipboard writes via `spawn_blocking` |

---

## 🌐 Supported Languages

| Language | Code |
|---|---|
| 简体中文 | `zh-CN` |
| 粵語 | `zh-HK` |
| English | `en-US` |
| 日本語 | `ja-JP` |
| 한국어 | `ko-KR` |
| Français | `fr-FR` |
| Deutsch | `de-DE` |
| Español | `es-ES` |
| Português | `pt-BR` |
| Italiano | `it-IT` |
| Русский | `ru-RU` |
| Polski | `pl-PL` |
| Türkçe | `tr-TR` |
| हिन्दी | `hi-IN` |

Language is auto-detected from your system locale and can be switched at any time from the dropdown in the sidebar. Your preference is saved to `localStorage`.

---

## 📂 Project Structure

```
code-copier/
├── src/                        # React frontend
│   ├── components/
│   │   └── LangSwitcher.tsx    # Language dropdown
│   ├── i18n/
│   │   ├── index.ts            # i18n initialization
│   │   ├── en-US.json          # English
│   │   ├── zh-CN.json          # Simplified Chinese
│   │   └── ...                 # 12 more language packs
│   ├── App.tsx                 # Main application component
│   ├── main.tsx                # Entry point
│   ├── types.ts                # TypeScript interfaces
│   └── styles.css              # All styles
├── src-tauri/
│   ├── src/
│   │   └── main.rs             # Rust backend (scan, copy, multi-window)
│   ├── capabilities/
│   │   └── default.json        # Tauri 2 permission config
│   ├── Cargo.toml
│   └── tauri.conf.json
├── index.html
├── package.json
├── vite.config.ts
└── tsconfig.json
```

---

## 🤝 Contributing

Contributions are welcome! Here are some ideas:

- 🌍 **Add a new language** — Create a new JSON file in `src/i18n/`, add it to `index.ts`
- 🎨 **Themes** — Light theme, system theme auto-detection
- 📋 **Copy format options** — Markdown code blocks, XML tags, custom templates
- 🔌 **IDE integration** — VS Code extension or CLI companion
- 📊 **Token estimation** — Show estimated token count for AI models

### Steps

1. Fork this repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**If this tool saves you time, give it a ⭐ on GitHub!**

Built with ❤️ using Rust and Tauri

</div>
```