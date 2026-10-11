import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function getR2Client() {
  const endpoint = getEnv("R2_ENDPOINT");
  const accessKeyId = getEnv("R2_ACCESS_KEY_ID");
  const secretAccessKey = getEnv("R2_SECRET_ACCESS_KEY");

  return new S3Client({
    region: "auto",
    endpoint,
    credentials: { accessKeyId, secretAccessKey },
  });
}

export async function createUploadUrl({
  bucket,
  key,
  contentType,
  expiresInSec = 900,
}: {
  bucket: string;
  key: string;
  contentType?: string;
  expiresInSec?: number;
}) {
  const client = getR2Client();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(client, command, {
    expiresIn: expiresInSec,
  });

  return { url, expiresInSec };
}

export async function uploadBufferToR2({
  bucket,
  key,
  contentType,
  body,
}: {
  bucket: string;
  key: string;
  contentType: string;
  body: Buffer;
}) {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

export async function deleteObjectFromR2({
  bucket,
  key,
}: {
  bucket: string;
  key: string;
}) {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}

export async function getR2PublicUrl(key: string): Promise<string> {
  const publicUrl =
    process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  if (publicUrl) return `${publicUrl.replace(/\/$/, "")}/${key}`;
  // Fallback: signed URL (7 days)
  const client = getR2Client();
  const bucket = process.env.R2_BUCKET ?? "zeriv-assets";
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, { expiresIn: 604800 });
}

/**
 * R2 key → public URL 동기 변환 (서버 API 응답 변환용).
 * DB에는 R2 key만 저장하고, API 응답 시점에 public URL로 변환하는 용도.
 *
 * production에서는 R2_PUBLIC_URL이 반드시 설정되어 있어야 한다.
 * getR2PublicUrl과 달리 signed URL fallback이 없고, 미설정 시 즉시 throw한다.
 */
export function r2KeyToPublicUrl(key: string): string {
  const publicUrl =
    process.env.R2_PUBLIC_URL ?? process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "";
  if (!publicUrl) throw new Error("R2_PUBLIC_URL is not configured");
  return `${publicUrl.replace(/\/$/, "")}/${key}`;
}

export async function getObjectFromR2({
  bucket,
  key,
  range,
}: {
  bucket: string;
  key: string;
  range?: string;
}) {
  const client = getR2Client();
  const res = await client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ...(range ? { Range: range } : {}),
    }),
  );
  return {
    body: res.Body,
    contentType: res.ContentType ?? "application/octet-stream",
    contentLength: res.ContentLength,
    contentRange: res.ContentRange,
  };
}
