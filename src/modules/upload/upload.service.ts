import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class UploadService {
  private readonly supabase: SupabaseClient;
  private readonly bucket = 'uploads';

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
  }

  private getSafeFileExtension(mimetype: string): string {
    if (mimetype === 'image/png') return 'png';
    if (mimetype === 'image/webp') return 'webp';
    return 'jpg';
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
    const { data: existingFiles, error: listError } = await this.supabase.storage
      .from(this.bucket)
      .list(folderPath, { limit: 100 });

    if (listError) {
      throw new InternalServerErrorException(
        `Supabase list failed: ${listError.message}`,
      );
    }

    if (!existingFiles?.length) return;

    const filesToDelete = existingFiles.map((file) => `${folderPath}/${file.name}`);
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
    // Validate MIME type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only jpeg, jpg, png, and webp images are allowed',
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

    const safeName = this.sanitizeNameForFile(profile.name || '');
    const extension = this.getSafeFileExtension(file.mimetype);
    const storagePath = `users/${authId}/${safeName}.${extension}`;

    // Keep only one avatar file per user in storage.
    await this.clearUserAvatarFolder(authId);

    const { error: uploadError } = await this.supabase.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
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
    // 1. Validate MIME type
    const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        'Only jpeg, jpg, png, and webp images are allowed',
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
      throw new BadRequestException('You are not authorized to upload images for this turf');
    }

    // 4. Storage path: turfs/{turfId}/{imageType}.jpg
    const storagePath = `turfs/${turfId}/${imageType}.jpg`;

    const { error: uploadError } = await this.supabase.storage
      .from(this.bucket)
      .upload(storagePath, file.buffer, {
        contentType: file.mimetype,
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
  }

  // ─────────────────────────────────────────
  // Delete turf images
  // ─────────────────────────────────────────
  async deleteTurfImage(authId: string, turfId: string, imageType: 'entrance' | 'dayTurf' | 'nightTurf') {
     // 1. Ensure the turf exists and belongs to the owner
     const turf = await this.prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: true },
    });

    if (!turf) {
      throw new NotFoundException('Turf not found');
    }

    if (turf.owner.authId !== authId) {
      throw new BadRequestException('You are not authorized to delete images for this turf');
    }

    const storagePath = `turfs/${turfId}/${imageType}.jpg`;

    const { error: deleteError } = await this.supabase.storage
      .from(this.bucket)
      .remove([storagePath]);

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

    return { success: true, message: `Turf ${imageType} image deleted successfully` };
  }
}
