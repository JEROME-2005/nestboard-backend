import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "./env.js";

// Cloudflare R2 is S3-compatible; env.ts guarantees the R2_* vars exist
// whenever UPLOAD_PROVIDER=r2.
let r2Client: S3Client | undefined;

function getR2Client(): S3Client {
  r2Client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID!,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return r2Client;
}

export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: env.R2_BUCKET!,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return `${env.R2_PUBLIC_BASE_URL!.replace(/\/$/, "")}/${key}`;
}
