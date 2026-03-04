import env from "@/config/dotenv.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import createHttpError from "http-errors";

const assertR2Configured = () => {
  if (
    !env.R2_ACCOUNT_ID ||
    !env.R2_ACCESS_KEY_ID ||
    !env.R2_SECRET_ACCESS_KEY ||
    !env.R2_BUCKET_NAME ||
    !env.R2_PUBLIC_BASE_URL
  ) {
    throw createHttpError(500, "Cloudflare R2 is not configured");
  }
};

const getClient = () => {
  assertR2Configured();

  return new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
  });
};

const sanitizePathPart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const buildFdDocumentObjectKey = (
  societyId: string,
  fixDepositId: string,
  fileName: string,
) => {
  const timestamp = Date.now();
  const safeName = sanitizePathPart(fileName || "document");
  return `societies/${sanitizePathPart(societyId)}/fixed-deposits/${sanitizePathPart(fixDepositId)}/${timestamp}-${safeName}`;
};

export const getFdDocumentPublicUrl = (objectKey: string) => {
  assertR2Configured();
  const base = env.R2_PUBLIC_BASE_URL.replace(/\/+$/, "");
  return `${base}/${objectKey}`;
};

export const generateFdDocumentUploadUrl = async (params: {
  objectKey: string;
  contentType?: string;
}) => {
  const client = getClient();
  const command = new PutObjectCommand({
    Bucket: env.R2_BUCKET_NAME,
    Key: params.objectKey,
    ContentType: params.contentType ?? "application/octet-stream",
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 60 * 10 });
  return uploadUrl;
};
