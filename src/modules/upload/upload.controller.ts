import {
  Controller,
  Post,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { UploadService } from './upload.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('api/v3/user-profile')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  /**
   * POST /api/v3/user-profile/upload-avatar
   * Upload (or replace) the authenticated user's profile image.
   * Expects multipart/form-data with field name "file".
   */
  @Post('upload-avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(), // keep file in memory; Supabase SDK needs a Buffer
      limits: { fileSize: 5 * 1024 * 1024 }, // hard-cap at 5 MB before hitting the service
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return cb(
            new BadRequestException('Only jpeg, png, and webp images are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadProfile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Image file is required (field: "file")');
    }
    return this.uploadService.uploadUserProfileImage(req.user.authId, file);
  }

  /**
   * DELETE /api/v3/user-profile/upload-avatar
   * Remove the authenticated user's profile image from Supabase Storage
   * and clear the avatarUrl in the database.
   */
  @Delete('upload-avatar')
  @HttpCode(HttpStatus.OK)
  async deleteProfile(@Req() req: any) {
    return this.uploadService.deleteUserProfileImage(req.user.authId);
  }
}
