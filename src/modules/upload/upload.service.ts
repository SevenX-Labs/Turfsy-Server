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

    // Storage path: users/${authId}/profile.jpg
    const storagePath = `users/${authId}/profile.jpg`;

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

    const storagePath = `users/${authId}/profile.jpg`;

    const { error: deleteError } = await this.supabase.storage
      .from(this.bucket)
      .remove([storagePath]);

    if (deleteError) {
      throw new InternalServerErrorException(`Supabase delete failed: ${deleteError.message}`);
    }

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
