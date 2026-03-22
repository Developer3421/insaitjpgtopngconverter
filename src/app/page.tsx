"use client";

import { useCallback, useRef, useState } from "react";

interface ConvertFile {
  id: string;
  file: File;
  status: "pending" | "converting" | "done" | "error";
  error?: string;
  objectUrl?: string;
  outputName?: string;
  outputSize?: number;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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

export default function HomePage() {
  const [files, setFiles] = useState<ConvertFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [converting, setConverting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setConverting(true);

    for (const item of pending) {
      setFiles((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: "converting" } : f))
      );

      try {
        const formData = new FormData();
        formData.append("file", item.file);

        const res = await fetch("/api/convert", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const { error } = await res.json();
          throw new Error(error || "Conversion failed.");
        }

        const blob = await res.blob();
        const objectUrl = URL.createObjectURL(blob);
        const outputName = item.file.name.replace(/\.[^.]+$/, "") + ".png";

        setFiles((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? {
                  ...f,
                  status: "done",
                  objectUrl,
                  outputName,
                  outputSize: blob.size,
                }
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

  const pendingCount = files.filter((f) => f.status === "pending").length;
  const doneCount = files.filter((f) => f.status === "done").length;

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
          Convert your JPEG images to lossless, high-quality PNG files instantly.
          All processing happens securely on the server.
        </p>
      </header>

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
            <div className="flex items-center justify-between px-5 py-4 border-b border-purple-900/40">
              <p className="text-gray-300 text-sm font-medium">
                {files.length} file{files.length !== 1 ? "s" : ""}
                {doneCount > 0 && (
                  <span className="text-green-400 ml-2">• {doneCount} converted</span>
                )}
              </p>
              <div className="flex gap-2">
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
                  {/* Icon */}
                  <div
                    className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
                    style={{ background: "linear-gradient(135deg, rgba(249,115,22,0.25), rgba(124,58,237,0.25))" }}
                  >
                    🖼
                  </div>

                  {/* Info */}
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

                  {/* Status */}
                  <StatusBadge status={item.status} />

                  {/* Download */}
                  {item.status === "done" && item.objectUrl && (
                    <a
                      href={item.objectUrl}
                      download={item.outputName}
                      className="download-btn text-xs font-semibold px-3 py-1.5 rounded-lg flex-shrink-0"
                    >
                      ↓ Download
                    </a>
                  )}

                  {/* Remove */}
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

      {/* Features */}
      <div className="w-full max-w-3xl mt-12 grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { icon: "⚡", title: "Fast & Lossless", desc: "Server-side conversion with Sharp — maximum quality PNG output." },
          { icon: "🔒", title: "Secure", desc: "Files are processed in memory and never stored on disk." },
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

