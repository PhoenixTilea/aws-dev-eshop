import { describe, expect, it, vi } from "vitest";

import {
  PRESIGNED_DOWNLOAD_EXPIRE_SECONDS,
  PRESIGNED_UPLOAD_EXPIRE_SECONDS,
  PRODUCTS_BUCKET_NAME
} from "../../src/constants";
import { getDownloadUrl, getUploadUrl } from "../../src/clients/s3Client";

// s3Client builds its S3Client at import time, and the signer needs a region and
// credentials to resolve. hoisted() runs before that import; the key pair is
// AWS's own documented example, so nothing real is being signed with.
//
// AWS_PROFILE has to go: the SDK prefers it over static env credentials, which
// would otherwise make these tests depend on whoever's SSO session is current.
vi.hoisted(() => {
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_SESSION_TOKEN;
  process.env.AWS_REGION = "eu-west-1";
  process.env.AWS_ACCESS_KEY_ID = "AKIAIOSFODNN7EXAMPLE";
  process.env.AWS_SECRET_ACCESS_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
});

const key = "product/7f3b9d1e-2c4a-4f6b-8d5e-1a2b3c4d5e6f/Wooden Shield.jpg";

const query = async (url: Promise<string> | string) => new URL(await url).searchParams;

describe("s3Client", () => {
  describe("getUploadUrl", () => {
    it("addresses the object it was asked to sign", async () => {
      const url = new URL(await getUploadUrl(PRODUCTS_BUCKET_NAME, key, "image/jpeg"));

      expect(url.protocol).toBe("https:");
      expect(url.hostname).toContain(PRODUCTS_BUCKET_NAME);
      expect(decodeURIComponent(url.pathname)).toBe(`/${key}`);
    });

    it("signs the content type, so the browser must send the one it asked for", async () => {
      // This is what makes the allowlist in UploadProductImageData binding: if
      // content-type were unsigned, a caller could declare image/png and upload
      // anything at all.
      const params = await query(getUploadUrl(PRODUCTS_BUCKET_NAME, key, "image/png"));

      expect(params.get("X-Amz-SignedHeaders")).toContain("content-type");
    });

    it("expires the upload url after the configured window", async () => {
      const params = await query(getUploadUrl(PRODUCTS_BUCKET_NAME, key, "image/jpeg"));

      expect(params.get("X-Amz-Expires")).toBe(String(PRESIGNED_UPLOAD_EXPIRE_SECONDS));
    });

    it("produces a different signature for a different content type", async () => {
      const [jpeg, png] = await Promise.all([
        query(getUploadUrl(PRODUCTS_BUCKET_NAME, key, "image/jpeg")),
        query(getUploadUrl(PRODUCTS_BUCKET_NAME, key, "image/png"))
      ]);

      expect(jpeg.get("X-Amz-Signature")).not.toBe(png.get("X-Amz-Signature"));
    });
  });

  describe("getDownloadUrl", () => {
    it("addresses the object it was asked to sign", async () => {
      const url = new URL(await getDownloadUrl(PRODUCTS_BUCKET_NAME, key));

      expect(url.hostname).toContain(PRODUCTS_BUCKET_NAME);
      expect(decodeURIComponent(url.pathname)).toBe(`/${key}`);
    });

    it("asks S3 to serve the image inline rather than as a download", async () => {
      const params = await query(getDownloadUrl(PRODUCTS_BUCKET_NAME, key));

      expect(params.get("response-content-disposition")).toBe("inline");
    });

    it("expires on the download window, which outlives the upload one", async () => {
      // Download urls are embedded in product responses and have to stay valid
      // while a page is open; upload urls are used once, immediately.
      const params = await query(getDownloadUrl(PRODUCTS_BUCKET_NAME, key));

      expect(params.get("X-Amz-Expires")).toBe(String(PRESIGNED_DOWNLOAD_EXPIRE_SECONDS));
      expect(PRESIGNED_DOWNLOAD_EXPIRE_SECONDS).toBeGreaterThan(PRESIGNED_UPLOAD_EXPIRE_SECONDS);
    });

    it("does not sign a content type, so any GET matches", async () => {
      const params = await query(getDownloadUrl(PRODUCTS_BUCKET_NAME, key));

      expect(params.get("X-Amz-SignedHeaders")).not.toContain("content-type");
    });
  });
});
