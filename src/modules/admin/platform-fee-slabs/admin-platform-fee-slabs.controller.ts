import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { PlatformFeeSlabService } from '../../platform-fee-slab/platform-fee-slab.service';
import { CreateSlabDto } from '../../platform-fee-slab/dto/create-slab.dto';
import { UpdateSlabDto } from '../../platform-fee-slab/dto/update-slab.dto';
import { JwtAdminGuard } from '../auth/guards/jwt-admin.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Admin Platform Fee Slabs')
@Controller('api/v1/admin/platform-fee-slabs')
@UseGuards(JwtAdminGuard)
@ApiBearerAuth()
export class AdminPlatformFeeSlabsController {
  constructor(private readonly slabService: PlatformFeeSlabService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new platform fee slab' })
  async create(@Body() dto: CreateSlabDto) {
    return this.slabService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'List all platform fee slabs' })
  async findAll() {
    return this.slabService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a platform fee slab' })
  async findOne(@Param('id') id: string) {
    return this.slabService.findOne(id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update an existing platform fee slab' })
  async update(@Param('id') id: string, @Body() dto: UpdateSlabDto) {
    return this.slabService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a platform fee slab' })
  async remove(@Param('id') id: string) {
    return this.slabService.remove(id);
  }
}
