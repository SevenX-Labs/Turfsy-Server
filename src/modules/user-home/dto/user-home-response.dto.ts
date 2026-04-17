import { UserHomeSectionDto } from './user-home-section.dto';

export class UserHomeResponseDto {
  success: boolean;
  userCity: string | null;
  sections: UserHomeSectionDto[];
}
