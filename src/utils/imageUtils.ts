import i18n from "../i18n";
import { ContentPart, ImageValidationResult } from "../types";

export const MAX_MULTIMODAL_REQUEST_BYTES = 9 * 1024 * 1024;

export const VALID_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
];

export class ImagePreparationError extends Error {
  constructor(
    public readonly code: "image_processing_failed" | "image_payload_too_large",
  ) {
    super(code);
    this.name = "ImagePreparationError";
  }
}

export const validateImageFile = (file: File): ImageValidationResult => {
  if (!VALID_IMAGE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: i18n.t("errors.unsupportedFormat", { type: file.type }),
    };
  }

  return { valid: true };
};

export const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Failed to convert file to base64"));
    };
    reader.onerror = (error) => reject(error);
  });

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new ImagePreparationError("image_processing_failed"));
    };
    image.src = objectUrl;
  });

const dimensionsWithin = (
  width: number,
  height: number,
  maxDimension: number,
) => {
  if (Math.max(width, height) <= maxDimension) return { width, height };
  if (width >= height) {
    return {
      width: maxDimension,
      height: Math.max(1, Math.round((height * maxDimension) / width)),
    };
  }
  return {
    width: Math.max(1, Math.round((width * maxDimension) / height)),
    height: maxDimension,
  };
};

const renderImage = async (
  file: File,
  maxDimension: number,
  quality: number,
): Promise<string> => {
  const image = await loadImage(file);
  const { width, height } = dimensionsWithin(
    image.naturalWidth,
    image.naturalHeight,
    maxDimension,
  );
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new ImagePreparationError("image_processing_failed");
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", quality);
};

const serializedBytes = (value: unknown): number =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength;

const compressionSteps = [
  { maxDimension: 2048, quality: 0.86 },
  { maxDimension: 1800, quality: 0.78 },
  { maxDimension: 1400, quality: 0.72 },
  { maxDimension: 1024, quality: 0.66 },
  { maxDimension: 768, quality: 0.58 },
];

export const prepareImageContent = async (
  text: string,
  files: File[],
): Promise<ContentPart[]> => {
  if (files.length === 0) return text ? [{ type: "text", text }] : [];

  for (const step of compressionSteps) {
    let urls: string[];
    try {
      urls = await Promise.all(
        files.map((file) => renderImage(file, step.maxDimension, step.quality)),
      );
    } catch (error) {
      if (error instanceof ImagePreparationError) throw error;
      throw new ImagePreparationError("image_processing_failed");
    }
    const parts: ContentPart[] = [
      ...(text ? [{ type: "text" as const, text }] : []),
      ...urls.map((url) => ({
        type: "image_url" as const,
        image_url: { url },
      })),
    ];
    if (serializedBytes({ message: parts }) <= MAX_MULTIMODAL_REQUEST_BYTES) {
      return parts;
    }
  }

  throw new ImagePreparationError("image_payload_too_large");
};
