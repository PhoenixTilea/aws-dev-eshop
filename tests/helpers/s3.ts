import type { S3Event, S3EventRecord } from "aws-lambda";

/**
 * An S3 object-created event carrying the given object keys. The real record has
 * ~20 fields (responseElements, userIdentity, the full bucket block, ...) that
 * the trigger never reads, so we fill in the object key and cast the rest away.
 *
 * Keys are passed exactly as S3 would send them — form-encoded — so tests can
 * feed in `+` and percent escapes without the helper quietly normalising them.
 */
export const makeS3Event = (encodedKeys: string[]): S3Event => ({
  Records: encodedKeys.map(
    key =>
      ({
        eventName: "ObjectCreated:Put",
        s3: {
          bucket: { name: "products-dev" },
          object: { key, size: 1024 }
        }
      }) as S3EventRecord
  )
});
