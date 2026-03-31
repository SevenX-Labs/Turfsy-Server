import { UserHomeSectionDto } from './user-home-section.dto';

export class UserHomeSectionResponseDto {
  success: boolean;
  userCity: string | null;
  section: UserHomeSectionDto;
}
