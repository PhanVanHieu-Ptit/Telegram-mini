import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'stream';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export type AttachmentType = 'image' | 'video' | 'audio' | 'file';

export interface CloudinaryUploadResult {
  url: string;
  public_id: string;
  type: AttachmentType;
  format: string;
  size: number;
  name: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo'];
const ALLOWED_AUDIO_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/ogg', 'audio/wav', 'audio/webm', 'audio/m4a', 'audio/aac'];
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
  'application/x-rar-compressed',
  'application/x-zip-compressed',
  'text/plain',
  'text/csv',
];

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;   // 10 MB
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;  // 100 MB
const MAX_AUDIO_SIZE = 20 * 1024 * 1024;   // 20 MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;    // 50 MB

function detectAttachmentType(mimeType: string): AttachmentType | null {
  if (ALLOWED_IMAGE_TYPES.includes(mimeType)) return 'image';
  if (ALLOWED_VIDEO_TYPES.includes(mimeType)) return 'video';
  if (ALLOWED_AUDIO_TYPES.includes(mimeType)) return 'audio';
  if (ALLOWED_FILE_TYPES.includes(mimeType)) return 'file';
  return null;
}

function getMaxSize(type: AttachmentType): number {
  switch (type) {
    case 'image': return MAX_IMAGE_SIZE;
    case 'video': return MAX_VIDEO_SIZE;
    case 'audio': return MAX_AUDIO_SIZE;
    case 'file': return MAX_FILE_SIZE;
  }
}

function getResourceType(type: AttachmentType): 'image' | 'video' | 'raw' {
  if (type === 'image') return 'image';
  if (type === 'video' || type === 'audio') return 'video';
  return 'raw';
}

export async function uploadToCloudinary(
  buffer: Buffer,
  mimeType: string,
  originalName: string,
  fileSize: number,
  folder = 'chat-media'
): Promise<CloudinaryUploadResult> {
  const attachmentType = detectAttachmentType(mimeType);
  if (!attachmentType) {
    const err: any = new Error(`Unsupported file type: ${mimeType}`);
    err.statusCode = 400;
    throw err;
  }

  const maxSize = getMaxSize(attachmentType);
  if (fileSize > maxSize) {
    const err: any = new Error(`File too large. Max ${maxSize / 1024 / 1024} MB for ${attachmentType}`);
    err.statusCode = 400;
    throw err;
  }

  const resourceType = getResourceType(attachmentType);

  return new Promise<CloudinaryUploadResult>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // For raw files keep original name as display_name
        ...(resourceType === 'raw' ? { public_id: `${folder}/${Date.now()}-${originalName}` } : {}),
      },
      (error, result) => {
        if (error || !result) {
          return reject(error ?? new Error('Cloudinary upload failed'));
        }
        console.log(`[Cloudinary] Upload success: ${result.secure_url}`);
        resolve({
          url: result.secure_url,
          public_id: result.public_id,
          type: attachmentType,
          format: result.format,
          size: fileSize,
          name: originalName,
        });
      }
    );

    const readable = Readable.from(buffer);
    readable.pipe(uploadStream);
  });
}
