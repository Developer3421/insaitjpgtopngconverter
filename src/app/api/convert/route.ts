import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "No file provided." },
        { status: 400 }
      );
    }

    const mimeType = file.type;
    if (!["image/jpeg", "image/jpg"].includes(mimeType)) {
      return NextResponse.json(
        { error: "Only JPEG/JPG files are supported." },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File exceeds the 20 MB limit." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const inputBuffer = Buffer.from(arrayBuffer);

    // Convert using sharp: lossless PNG with full metadata preservation
    const outputBuffer = await sharp(inputBuffer, { failOn: "none" })
      .png({
        compressionLevel: 9,
        adaptiveFiltering: true,
        effort: 10,
      })
      .toBuffer();

    const originalName = file.name.replace(/\.[^.]+$/, "");
    const outputFileName = `${originalName}.png`;

    return new NextResponse(outputBuffer.buffer as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="${outputFileName}"`,
        "Content-Length": String(outputBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("Conversion error:", err);
    return NextResponse.json(
      { error: "Failed to convert image. Please try a valid JPEG file." },
      { status: 500 }
    );
  }
}
