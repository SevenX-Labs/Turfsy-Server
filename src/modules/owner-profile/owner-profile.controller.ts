import { Controller } from '@nestjs/common';
import { OwnerProfileService } from './owner-profile.service';

@Controller('owner-profile')
export class OwnerProfileController {
  constructor(private readonly ownerProfileService: OwnerProfileService) {}
}
