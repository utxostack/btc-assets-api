import 'dotenv/config';
import z from 'zod';
import process from 'node:process';

const envSchema = z.object({
  ORDINALS_API_BASE_URL: z.string(),
});

export type Env = z.infer<typeof envSchema>;
export const env = envSchema.parse(process.env);
