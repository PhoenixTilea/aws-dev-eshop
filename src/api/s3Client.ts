import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { PRESIGNED_DOWNLOAD_EXPIRE_SECONDS, PRESIGNED_UPLOAD_EXPIRE_SECONDS } from "./constants";

const client = new S3Client({});

export const getUploadUrl = (bucket: string, key: string, contentType: string) => {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    ContentType: contentType
  });
  return getSignedUrl(client, command, {
    expiresIn: PRESIGNED_UPLOAD_EXPIRE_SECONDS,
    // Without this the presigner signs only `host` and drops ContentType on the
    // floor: the same signature comes back for image/jpeg, image/png and no type
    // at all, so the caller could upload anything under any type and the
    // allowlist in UploadProductImageData would be decorative. Signing it binds
    // the upload to the type we approved.
    signableHeaders: new Set(["content-type"])
  });
};

export const getDownloadUrl = (bucket: string, key: string) => {
  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: key,
    ResponseContentDisposition: "inline"
  });
  return getSignedUrl(client, command, {
    expiresIn: PRESIGNED_DOWNLOAD_EXPIRE_SECONDS
  });
};
