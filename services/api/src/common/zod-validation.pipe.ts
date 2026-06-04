import { BadRequestException, PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * A small validation pipe that parses a request value against a Zod schema from
 * `@nestai/contracts`. Used per-handler: `@Body(new ZodValidationPipe(Schema))`.
 *
 * On failure it throws a 400 with the flattened Zod issues so the GitHub Pages
 * dashboard can surface field-level errors.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException({
        message: 'Validation failed',
        issues: result.error.issues,
      });
    }
    return result.data;
  }
}
