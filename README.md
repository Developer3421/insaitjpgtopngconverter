This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

# Insait Jpeg to Png Converter

A Next.js web application that converts JPEG/JPG images to high-quality lossless PNG files instantly.

## Features

- **Drag & drop** or click-to-browse file upload
- **Batch conversion** — upload and convert multiple files at once
- **Selectable PNG size presets** — keep the original dimensions or resize to 75%, 50%, or 25%
- **Lossless PNG output** via [Sharp](https://sharp.pixelplumbing.com/) (max compression, adaptive filtering)
- **In-memory processing** — files are never written to disk
- **20 MB per file** limit
- **Orange-purple** dark theme

## Tech Stack

- [Next.js 16](https://nextjs.org/) (App Router)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Sharp](https://sharp.pixelplumbing.com/) for server-side image conversion

## Getting Started

First, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Build for Production

```bash
npm run build
npm start
```

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
