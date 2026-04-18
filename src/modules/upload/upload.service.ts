import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../prisma/prisma.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';

@Injectable()
export class UploadService {
  private readonly supabase: SupabaseClient;
  private readonly bucket = 'uploads';
  private readonly imageOutputQuality = 75;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const url = this.config.get<string>('SUPABASE_URL');
    const key = this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !key) {
      throw new InternalServerErrorException(
        'Supabase credentials are not configured',
      );
    }

    this.supabase = createClient(url, key);

    // Cloudinary configuration for video uploads
    const cloudinaryUrl = this.config.get<string>('CLOUDINARY_URL');
    if (cloudinaryUrl) {
      cloudinary.config({
        cloudinary_url: cloudinaryUrl,
      });
    }
  }

  private parsePositiveInt(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    const parsed = Number.parseInt(String(value), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private getSafeFileExtension(mimetype: string): string {
    if (mimetype === 'image/png') return 'png';
    if (mimetype === 'image/webp') return 'webp';
    return 'jpg';
  }

  private async optimizeImageToWebp(input: Buffer): Promise<Buffer> {
    try {
      return await sharp(input)
        .rotate()
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: this.imageOutputQuality })
        .toBuffer();
    } catch (error) {
      throw new BadRequestException('Invalid image format or corrupted file');
    }
  }


  private sanitizeNameForFile(name: string): string {
    const sanitized = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    return sanitized || 'user';
  }

  private async clearUserAvatarFolder(authId: string) {
    const folderPath = `users/${authId}`;
    const { data: existingFiles, error: listError } =
      await this.supabase.storage
        .from(this.bucket)
        .list(folderPath, { limit: 100 });

    if (listError) {
      throw new InternalServerErrorException(
        `Supabase list failed: ${listError.message}`,
      );
    }

    if (!existingFiles?.length) return;

    const filesToDelete = existingFiles.map(
      (file) => `${folderPath}/${file.name}`,
    );
    const { error: deleteError } = await this.supabase.storage
      .from(this.bucket)
      .remove(filesToDelete);

    if (deleteError) {
      throw new InternalServerErrorException(
        `Supabase delete failed: ${deleteError.message}`,
      );
    }
  }

  // ─────────────────────────────────────────
  // Upload user profile image
  // ─────────────────────────────────────────
  async uploadUserProfileImage(authId: string, file: Express.Multer.File) {
    try {
      // Validate MIME type
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'application/octet-stream',
      ];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Only jpeg, jpg, png, webp, heic, heif, and octet-stream images are allowed',
        );
      }

      // Validate file size (5 MB)
      const maxSizeBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        throw new BadRequestException('File size must not exceed 5 MB');
      }

      // Ensure the user profile exists
      const profile = await this.prisma.userProfile.findUnique({
        where: { authId },
      });
      if (!profile) {
        throw new NotFoundException('User profile not found');
      }
      if (!profile.name?.trim()) {
        throw new BadRequestException(
          'Please complete profile name before uploading avatar',
        );
      }

      const storagePath = `users/${authId}/avatar.webp`;

      // Keep only one avatar file per user in storage.
      await this.clearUserAvatarFolder(authId);

      const fileBuffer = file.buffer || (await fs.promises.readFile(file.path));
      const optimizedBuffer = await this.optimizeImageToWebp(fileBuffer);

      const { error: uploadError } = await this.supabase.storage
        .from(this.bucket)
        .upload(storagePath, optimizedBuffer, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: true, // overwrite any existing file
        });

      if (uploadError) {
        throw new InternalServerErrorException(
          `Supabase upload failed: ${uploadError.message}`,
        );
      }

      // Retrieve public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucket)
        .getPublicUrl(storagePath);

      const avatarUrl = urlData.publicUrl;

      // Persist to DB
      await this.prisma.userProfile.update({
        where: { authId },
        data: { avatarUrl },
      });

      return { success: true, avatarUrl };
    } finally {
      if (file.path) {
        await fs.promises.unlink(file.path).catch(() => {});
      }
    }
  }

  // ─────────────────────────────────────────
  // Delete user profile image
  // ─────────────────────────────────────────
  async deleteUserProfileImage(authId: string) {
    const profile = await this.prisma.userProfile.findUnique({
      where: { authId },
    });
    if (!profile) {
      throw new NotFoundException('User profile not found');
    }

    await this.clearUserAvatarFolder(authId);

    await this.prisma.userProfile.update({
      where: { authId },
      data: { avatarUrl: null },
    });

    return { success: true, message: 'Profile image deleted successfully' };
  }

  // ─────────────────────────────────────────
  // Upload turf image
  // ─────────────────────────────────────────
  async uploadTurfImage(
    authId: string,
    turfId: string,
    imageType: 'entrance' | 'dayTurf' | 'nightTurf',
    file: Express.Multer.File,
  ) {
    try {
      // 1. Validate MIME type
      const allowedMimeTypes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/heic',
        'image/heif',
        'application/octet-stream',
      ];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Only jpeg, jpg, png, webp, heic, heif, and octet-stream images are allowed',
        );
      }

      // 2. Validate file size (5 MB)
      const maxSizeBytes = 5 * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        throw new BadRequestException('File size must not exceed 5 MB');
      }

      // 3. Ensure the turf exists and belongs to the owner
      const turf = await this.prisma.turf.findUnique({
        where: { id: turfId },
        include: { owner: true },
      });

      if (!turf) {
        throw new NotFoundException('Turf not found');
      }

      if (turf.owner.authId !== authId) {
        throw new BadRequestException(
          'You are not authorized to upload images for this turf',
        );
      }

      // 4. Storage path: turfs/{turfId}/{imageType}.webp
      const storagePath = `turfs/${turfId}/${imageType}.webp`;

      const fileBuffer = file.buffer || (await fs.promises.readFile(file.path));
      const optimizedBuffer = await this.optimizeImageToWebp(fileBuffer);

      const { error: uploadError } = await this.supabase.storage
        .from(this.bucket)
        .upload(storagePath, optimizedBuffer, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: true, // overwrite any existing file
        });

      if (uploadError) {
        throw new InternalServerErrorException(
          `Supabase upload failed: ${uploadError.message}`,
        );
      }

      // 5. Retrieve public URL
      const { data: urlData } = this.supabase.storage
        .from(this.bucket)
        .getPublicUrl(storagePath);

      const imageUrl = urlData.publicUrl;

      // 6. Map imageType to schema field
      const fieldMap = {
        entrance: 'entranceUrl',
        dayTurf: 'groundDayUrl',
        nightTurf: 'groundNightUrl',
      };
      const dbField = fieldMap[imageType];

      // 7. Persist to DB
      await this.prisma.turf.update({
        where: { id: turfId },
        data: { [dbField]: imageUrl },
      });

      return { success: true, imageUrl, type: imageType };
    } finally {
      if (file && file.path) {
        await fs.promises.unlink(file.path).catch(() => {});
      }
    }
  }

  // ─────────────────────────────────────────
  // Delete turf images
  // ─────────────────────────────────────────
  async deleteTurfImage(
    authId: string,
    turfId: string,
    imageType: 'entrance' | 'dayTurf' | 'nightTurf',
  ) {
    // 1. Ensure the turf exists and belongs to the owner
    const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: true },
    });

    if (!turf) {
      throw new NotFoundException('Turf not found');
    }

    if (turf.owner.authId !== authId) {
      throw new BadRequestException(
        'You are not authorized to delete images for this turf',
      );
    }

    const legacyStoragePath = `turfs/${turfId}/${imageType}.jpg`;
    const storagePath = `turfs/${turfId}/${imageType}.webp`;

    const { error: deleteError } = await this.supabase.storage
      .from(this.bucket)
      .remove([storagePath, legacyStoragePath]);

    if (deleteError) {
      throw new InternalServerErrorException(
        `Supabase delete failed: ${deleteError.message}`,
      );
    }

    // 2. Map imageType to schema field
    const fieldMap = {
      entrance: 'entranceUrl',
      dayTurf: 'groundDayUrl',
      nightTurf: 'groundNightUrl',
    };
    const dbField = fieldMap[imageType];

    // 3. Persist to DB
    await this.prisma.turf.update({
      where: { id: turfId },
      data: { [dbField]: null },
    });

    return {
      success: true,
      message: `Turf ${imageType} image deleted successfully`,
    };
  }

  // ─────────────────────────────────────────
  // Upload turf video (H.264 MP4)
  // ─────────────────────────────────────────
  // ─────────────────────────────────────────
  // Upload turf video (using Cloudinary)
  // ─────────────────────────────────────────
  async uploadTurfVideo(authId: string, turfId: string, file: Express.Multer.File) {
    let inputPath = file.path;
    let createdInputPath = false;

    try {
      const allowedMimeTypes = [
        'video/mp4',
        'video/quicktime',
        'video/x-matroska',
        'video/webm',
        'video/x-msvideo',
        'video/avi',
      ];
      if (!allowedMimeTypes.includes(file.mimetype)) {
        throw new BadRequestException(
          'Only mp4, mov, mkv, and webm videos are allowed',
        );
      }

      const maxVideoMb =
        this.parsePositiveInt(this.config.get('UPLOAD_MAX_VIDEO_MB')) ?? 50;
      const maxSizeBytes = maxVideoMb * 1024 * 1024;
      if (file.size > maxSizeBytes) {
        throw new BadRequestException(
          `File size must not exceed ${maxVideoMb} MB`,
        );
      }

      if (!inputPath) {
        inputPath = path.join(
          os.tmpdir(),
          `turf-video-in-${turfId}-${Date.now()}-${Math.round(Math.random() * 1e9)}`,
        );
        const fileBuffer = file.buffer;
        if (!fileBuffer) {
          throw new BadRequestException('Video file is required');
        }
        await fs.promises.writeFile(inputPath, fileBuffer);
        createdInputPath = true;
      }

      const turf = await this.prisma.turf.findUnique({
        where: { id: turfId },
        include: { owner: true },
      });

      if (!turf) {
        throw new NotFoundException('Turf not found');
      }

      if (turf.owner.authId !== authId) {
        throw new BadRequestException(
          'You are not authorized to upload videos for this turf',
        );
      }

      // Upload to Cloudinary with automatic optimization
      const result = await cloudinary.uploader.upload(inputPath, {
        resource_type: 'video',
        folder: `turfs/${turfId}`,
        public_id: 'video',
        overwrite: true,
        invalidate: true,
      });

      // Generate an optimized URL (auto format and quality) for fast loading
      const videoUrl = cloudinary.url(result.public_id, {
        resource_type: 'video',
        quality: 'auto',
        fetch_format: 'auto',
        secure: true,
      });

      await this.prisma.turf.update({
        where: { id: turfId },
        data: { videoUrl },
      });

      return { success: true, videoUrl };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      if (err instanceof NotFoundException) throw err;
      if (err instanceof InternalServerErrorException) throw err;

      throw new InternalServerErrorException(
        `Video upload failed: ${err.message || 'Unknown error'}`,
      );
    } finally {
      if (inputPath && (createdInputPath || file.path)) {
        await fs.promises.unlink(inputPath).catch(() => {});
      }
    }
  }
}
