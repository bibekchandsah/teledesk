import { S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

// Cloudflare R2 is S3-compatible. The endpoint is:
// https://<ACCOUNT_ID>.r2.cloudflarestorage.com
export const r2Client = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME!;

// Public base URL for R2 (your R2 custom domain or the public dev URL)
// e.g. https://pub-<hash>.r2.dev  or  https://files.yourdomain.com
export const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL!;
