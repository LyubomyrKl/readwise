import { IsString, IsNotEmpty, IsNumber, IsOptional, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateBookDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  author!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  filename!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  mime!: string;

  @ApiProperty()
  @IsNumber()
  @Min(1)
  sizeBytes!: number;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  sha256!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  cover?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  pageCount?: number;
}

export class FinalizeBookDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  bookId!: string;
}