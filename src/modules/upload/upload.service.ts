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

    // Storage path: users/{authId}/profile.jpg
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
    // Ensure the user profile exists
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
      throw new InternalServerErrorException(
        `Supabase delete failed: ${deleteError.message}`,
      );
    }

    // Clear avatarUrl in DB (Prisma type: NullableStringFieldUpdateOperationsInput | string | null)
    await this.prisma.userProfile.update({
      where: { authId },
      data: { avatarUrl: null },
    });

    return { success: true, message: 'Profile image deleted successfully' };
  }
}
