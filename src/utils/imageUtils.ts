export const MAX_IMAGE_SIZE_MB = 4;
export const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

export const VALID_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export function validateImageFile(file: File): ImageValidationResult {
  if (!VALID_IMAGE_TYPES.includes(file.type)) {
    return { 
      valid: false, 
      error: `Formato não suportado (${file.type}). Apenas JPEG, PNG, GIF e WebP são permitidos.` 
    };
  }
  
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return { 
      valid: false, 
      error: `Imagem muito grande. O limite é de ${MAX_IMAGE_SIZE_MB}MB.` 
    };
  }
  
  return { valid: true };
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });
}

// Optional resizing if needed for large images
export function resizeImage(dataUrl: string, maxDimension = 1600): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      let { width, height } = img;
      
      if (width <= maxDimension && height <= maxDimension) {
        resolve(dataUrl); // No resize needed
        return;
      }
      
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
      
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85)); // compress as JPEG
    };
    img.onerror = reject;
  });
}
