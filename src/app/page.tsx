"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearAllConversions,
  ConversionRecord,
  deleteConversion,
  listConversions,
  saveConversion,
} from "./lib/indexeddb";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

interface ConvertFile {
  id: string;
  file: File;
  status: "pending" | "converting" | "done" | "error";
  error?: string;
  objectUrl?: string;
  outputName?: string;
  outputSize?: number;
}

const OUTPUT_SIZE_OPTIONS = [
  {
    value: "100",
    label: "Original (100%)",
    scale: 1,
    hint: "Keep the original image dimensions.",
  },
  {
    value: "75",
    label: "Large (75%)",
    scale: 0.75,
    hint: "Shrink the PNG to 75% while keeping the aspect ratio.",
  },
  {
    value: "50",
    label: "Medium (50%)",
    scale: 0.5,
    hint: "Shrink the PNG to half of the original dimensions.",
  },
  {
    value: "25",
    label: "Small (25%)",
    scale: 0.25,
    hint: "Create a compact PNG at 25% of the original size.",
  },
] as const;

type OutputSizeOptionValue = (typeof OUTPUT_SIZE_OPTIONS)[number]["value"];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString();
}

function getOutputSizeOption(value: OutputSizeOptionValue) {
  return (
    OUTPUT_SIZE_OPTIONS.find((option) => option.value === value) ??
    OUTPUT_SIZE_OPTIONS[0]
  );
}

function getScaledDimensions(width: number, height: number, scale: number) {
  const safeScale = scale > 0 && scale <= 1 ? scale : 1;

  return {
    width: Math.max(1, Math.round(width * safeScale)),
    height: Math.max(1, Math.round(height * safeScale)),
  };
}

function StatusBadge({ status }: { status: ConvertFile["status"] }) {
  const map: Record<ConvertFile["status"], { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "badge-pending" },
    converting: { label: "Converting…", cls: "badge-converting" },
    done: { label: "Done ✓", cls: "badge-success" },
    error: { label: "Error", cls: "badge-error" },
  };
  const { label, cls } = map[status];
  return (
    <span className={`${cls} text-xs font-semibold px-2.5 py-0.5 rounded-full`}>
      {label}
    </span>
  );
}

/** Convert a JPEG File to a PNG Blob entirely in the browser using the Canvas API. */
function convertJpegToPng(file: File, scale: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let objectUrl: string | null = null;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
        objectUrl = null;
      }
    };

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const { width, height } = getScaledDimensions(
          img.naturalWidth,
          img.naturalHeight,
          scale
        );
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          reject(new Error("Canvas not supported in this browser."));
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);
        cleanup();
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("PNG conversion failed."));
        }, "image/png");
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new Error("Failed to load image."));
    };

    objectUrl = URL.createObjectURL(file);
    img.src = objectUrl;
  });
}

export default function HomePage() {
  const [files, setFiles] = useState<ConvertFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const [tab, setTab] = useState<"convert" | "history">("convert");
  const [history, setHistory] = useState<ConversionRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [outputSize, setOutputSize] = useState<OutputSizeOptionValue>("100");
  const inputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const records = await listConversions();
      setHistory(records);
    } catch {
      // IndexedDB unavailable (e.g., private browsing in some browsers)
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab, loadHistory]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const arr = Array.from(incoming);
    const jpeg = arr.filter((f) =>
      ["image/jpeg", "image/jpg"].includes(f.type)
    );
    if (!jpeg.length) return;
    setFiles((prev) => [
      ...prev,
      ...jpeg.map((f) => ({
        id: `${f.name}-${f.size}-${crypto.randomUUID()}`,
        file: f,
        status: "pending" as const,
      })),
    ]);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      addFiles(e.target.files);
      e.target.value = "";
    }
  };

  const removeFile = (id: string) => {
    setFiles((prev) => {
      const item = prev.find((f) => f.id === id);
      if (item?.objectUrl) URL.revokeObjectURL(item.objectUrl);
      return prev.filter((f) => f.id !== id);
    });
  };

  const convertAll = async () => {
    const pending = files.filter((f) => f.status === "pending");
    if (!pending.length) return;
    const selectedOutputSize = getOutputSizeOption(outputSize);
    setConverting(true);

    for (const item of pending) {
      if (item.file.size > MAX_FILE_SIZE) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: "error", error: "File exceeds the 20 MB limit." }
              : f
          )
        );
        continue;
      }

      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "converting" } : f))
      );

      try {
        const blob = await convertJpegToPng(item.file, selectedOutputSize.scale);
        const outputName = item.file.name.replace(/\.[^.]+$/, "") + ".png";
        const objectUrl = URL.createObjectURL(blob);

        // Auto-download the converted file
        const a = document.createElement("a");
        a.href = objectUrl;
        a.download = outputName;
        a.click();

        // Persist to IndexedDB
        await saveConversion({
          id: item.id,
          originalName: item.file.name,
          outputName,
          originalSize: item.file.size,
          outputSize: blob.size,
          convertedAt: Date.now(),
          blob,
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: "done", objectUrl, outputName, outputSize: blob.size }
              : f
          )
        );
      } catch (err) {
        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: "error",
                  error: err instanceof Error ? err.message : "Unknown error",
                }
              : f
          )
        );
      }
    }

    setConverting(false);
  };

  const clearAll = () => {
    files.forEach((f) => {
      if (f.objectUrl) URL.revokeObjectURL(f.objectUrl);
    });
    setFiles([]);
  };

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const downloadHistoryItem = (record: ConversionRecord) => {
    const url = URL.createObjectURL(record.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = record.outputName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const removeHistoryItem = async (id: string) => {
    await deleteConversion(id);
    setHistory((prev) => prev.filter((r) => r.id !== id));
  };

  const clearHistory = async () => {
    await clearAllConversions();
    setHistory([]);
  };

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;
  const selectedOutputSize = getOutputSizeOption(outputSize);

  return (
    <div className="gradient-bg min-h-screen flex flex-col items-center justify-start px-4 py-12 font-sans">
      {/* Header */}
      <header className="w-full max-w-3xl mb-10 text-center">
        <div className="inline-flex items-center gap-2 mb-3">
          <span className="text-4xl">🖼️</span>
        </div>
        <h1 className="text-gradient text-4xl sm:text-5xl font-extrabold tracking-tight leading-tight mb-3">
          Insait Jpeg to Png Converter
        </h1>
        <p className="text-gray-400 text-base sm:text-lg max-w-xl mx-auto">
          Convert your JPEG images to PNG files entirely in your browser.
          No server uploads — all processing is local and private.
        </p>
      </header>

      {/* Tabs */}
      <div className="w-full max-w-3xl mb-6 flex gap-2">
        <button
          onClick={() => setTab("convert")}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === "convert"
              ? "btn-primary text-white"
              : "border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
          }`}
        >
          Convert
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all ${
            tab === "history"
              ? "btn-primary text-white"
              : "border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500"
          }`}
        >
          History
        </button>
      </div>

      {tab === "convert" && (
        <>
          {/* Drop Zone */}
          <div className="w-full max-w-3xl mb-6">
            <div
              className={`drop-zone rounded-2xl p-10 text-center cursor-pointer select-none ${dragOver ? "drag-over" : ""}`}
              onClick={() => inputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center gap-4">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl"
                  style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.2), rgba(124,58,237,0.2))" }}
                >
                  📁
                </div>
                <div>
                  <p className="text-white font-semibold text-lg mb-1">
                    Drag &amp; drop JPEG files here
                  </p>
                  <p className="text-gray-400 text-sm">
                    or{" "}
                    <span className="text-orange-400 underline underline-offset-2">
                      click to browse
                    </span>{" "}
                    — up to 20 MB per file
                  </p>
                </div>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/jpg"
                  multiple
                  className="hidden"
                  onChange={handleFileInput}
                />
              </div>
            </div>
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="w-full max-w-3xl">
              <div
                className="card-glow rounded-2xl overflow-hidden"
                style={{ background: "rgba(13, 0, 20, 0.8)", backdropFilter: "blur(20px)" }}
              >
                {/* Toolbar */}
                <div className="flex flex-col gap-3 px-5 py-4 border-b border-purple-900/40 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-gray-300 text-sm font-medium">
                      {files.length} file{files.length !== 1 ? "s" : ""}
                      {doneCount > 0 && (
                        <span className="text-green-400 ml-2">• {doneCount} converted</span>
                      )}
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      PNG size: {selectedOutputSize.label}. {selectedOutputSize.hint}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <label className="text-xs text-gray-400 flex items-center gap-2">
                      <span>PNG size</span>
                      <select
                        value={outputSize}
                        onChange={(e) =>
                          setOutputSize(e.target.value as OutputSizeOptionValue)
                        }
                        disabled={converting}
                        className="rounded-lg border border-gray-700 bg-black/40 px-3 py-1.5 text-gray-200 outline-none transition-colors focus:border-orange-400 disabled:opacity-50"
                      >
                        {OUTPUT_SIZE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      onClick={clearAll}
                      disabled={converting}
                      className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:text-white hover:border-gray-400 transition-all disabled:opacity-40"
                    >
                      Clear all
                    </button>
                    <button
                      onClick={convertAll}
                      disabled={converting || pendingCount === 0}
                      className="btn-primary text-white text-sm font-semibold px-5 py-1.5 rounded-lg"
                    >
                      {converting ? "Converting…" : `Convert ${pendingCount > 0 ? `(${pendingCount})` : ""}`}
                    </button>
                  </div>
                </div>

                {/* File rows */}
                <ul className="divide-y divide-purple-900/20 max-h-96 overflow-y-auto scrollbar-thin">
                  {files.map((item) => (
                    <li key={item.id} className="file-item px-5 py-3.5 flex items-center gap-4">
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
                        style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.25), rgba(124,58,237,0.25))" }}
                      >
                        🖼
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-medium truncate">{item.file.name}</p>
                        <p className="text-gray-500 text-xs">
                          {formatBytes(item.file.size)}
                          {item.status === "done" && item.outputSize && (
                            <span className="text-green-400 ml-2">
                              → {formatBytes(item.outputSize)}
                            </span>
                          )}
                        </p>
                        {item.status === "error" && item.error && (
                          <p className="text-red-400 text-xs mt-0.5">{item.error}</p>
                        )}
                      </div>

                      <StatusBadge status={item.status} />

                      {item.status === "done" && item.objectUrl && (
                        <a
                          href={item.objectUrl}
                          download={item.outputName}
                          className="download-btn text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                        >
                          ↓ Download
                        </a>
                      )}

                      <button
                        onClick={() => removeFile(item.id)}
                        disabled={item.status === "converting"}
                        className="flex-shrink-0 text-gray-600 hover:text-red-400 transition-colors disabled:opacity-30 text-lg leading-none"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Download all */}
                {doneCount > 1 && (
                  <div className="px-5 py-4 border-t border-purple-900/40 flex justify-end">
                    <button
                      onClick={() => {
                        files
                          .filter((f) => f.status === "done" && f.objectUrl)
                          .forEach((f) => {
                            const a = document.createElement("a");
                            a.href = f.objectUrl!;
                            a.download = f.outputName!;
                            a.click();
                          });
                      }}
                      className="download-btn text-sm font-semibold px-5 py-2 rounded-lg"
                    >
                      ↓ Download all ({doneCount})
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        <div className="w-full max-w-3xl">
          <div
            className="card-glow rounded-2xl overflow-hidden"
            style={{ background: "rgba(13, 0, 20, 0.8)", backdropFilter: "blur(20px)" }}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-purple-900/40">
              <p className="text-gray-300 text-sm font-medium">
                {history.length} saved conversion{history.length !== 1 ? "s" : ""} in IndexedDB
              </p>
              {history.length > 0 && (
                <button
                  onClick={clearHistory}
                  className="text-xs px-3 py-1.5 rounded-lg border border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-500 transition-all"
                >
                  Clear history
                </button>
              )}
            </div>

            {historyLoading && (
              <p className="text-gray-500 text-sm text-center py-10">Loading…</p>
            )}

            {!historyLoading && history.length === 0 && (
              <p className="text-gray-600 text-sm text-center py-10">
                No conversions saved yet. Convert a file to see it here.
              </p>
            )}

            {!historyLoading && history.length > 0 && (
              <ul className="divide-y divide-purple-900/20 max-h-[32rem] overflow-y-auto scrollbar-thin">
                {history.map((record) => (
                  <li key={record.id} className="file-item px-5 py-3.5 flex items-center gap-4">
                    <div
                      className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg"
                      style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(124,58,237,0.2))" }}
                    >
                      🖼
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm font-medium truncate">{record.outputName}</p>
                      <p className="text-gray-500 text-xs">
                        {formatBytes(record.originalSize)} → {formatBytes(record.outputSize)}
                        <span className="ml-2 text-gray-600">{formatDate(record.convertedAt)}</span>
                      </p>
                    </div>

                    <button
                      onClick={() => downloadHistoryItem(record)}
                      className="download-btn text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                    >
                      ↓ Download
                    </button>

                    <button
                      onClick={() => removeHistoryItem(record.id)}
                      className="flex-shrink-0 text-gray-600 hover:text-red-400 transition-colors text-lg leading-none"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Features */}
      <div className="w-full max-w-3xl mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: "⚡", title: "100% Local", desc: "Conversion runs in your browser using the Canvas API — no server, no uploads." },
          { icon: "🗄️", title: "IndexedDB Storage", desc: "Converted files are saved locally in your browser's IndexedDB for later re-download." },
          { icon: "📦", title: "Batch Support", desc: "Upload multiple JPEG files and convert them all at once." },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-xl p-5 text-center"
            style={{
              background: "rgba(124, 58, 237, 0.07)",
              border: "1px solid rgba(124, 58, 237, 0.2)",
            }}
          >
            <div className="text-3xl mb-2">{f.icon}</div>
            <h3 className="text-white font-semibold text-sm mb-1">{f.title}</h3>
            <p className="text-gray-400 text-xs leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Footer */}
      <footer className="mt-16 text-gray-600 text-xs text-center">
        © {new Date().getFullYear()} Insait · Jpeg to Png Converter
      </footer>
    </div>
  );
}
