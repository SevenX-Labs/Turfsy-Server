import { Controller } from '@nestjs/common';
import { TurfsService } from './turfs.service';

@Controller('turfs')
export class TurfsController {
  constructor(private readonly turfsService: TurfsService) {}
}
