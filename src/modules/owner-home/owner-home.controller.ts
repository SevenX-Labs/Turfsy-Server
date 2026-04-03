import { Controller } from '@nestjs/common';
import { OwnerHomeService } from './owner-home.service';

@Controller('owner-home')
export class OwnerHomeController {
  constructor(private readonly ownerHomeService: OwnerHomeService) {}
}
