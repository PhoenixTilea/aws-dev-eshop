import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { PRESIGNED_EXPIRE_MINS } from "./constants";

const client = new S3Client({});

export const getUploadUrl = (bucket: string, key: string) => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: "image/jpeg"
  });
  return getSignedUrl(client, command, {
    expiresIn: PRESIGNED_EXPIRE_MINS
  });
};

export const getDownloadUrl = (bucket: string, key: string) => {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  return getSignedUrl(client, command, {
    expiresIn: PRESIGNED_EXPIRE_MINS
  });
};
