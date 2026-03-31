import { TurfCardDto } from './turf-card.dto';
import { HomeSectionType } from '../types/home-section.enum';

export class UserHomeSectionDto {
  sectionType: HomeSectionType;
  title: string;
  subtitle?: string;
  turfs: TurfCardDto[];
}
