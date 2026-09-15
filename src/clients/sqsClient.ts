import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";

import { REJECTED_IMAGE_EVENTS_QUEUE_URL } from "../constants";
import type { RejectedImageEvent } from "../api/eventErrors";

let client: SQSClient | undefined;

const sqsClient = () => {
  const endpoint = process.env.AWS_ENDPOINT_URL;
  client ??= new SQSClient(endpoint ? { endpoint } : {});
  return client;
};

/**
 * Parks an event the trigger will never be able to process.
 */
export const rejectImageEvent = async (rejection: RejectedImageEvent) => {
  const QueueUrl = process.env[REJECTED_IMAGE_EVENTS_QUEUE_URL];
  if (!QueueUrl) {
    throw new Error(`${REJECTED_IMAGE_EVENTS_QUEUE_URL} is not set.`);
  }
  await sqsClient().send(
    new SendMessageCommand({
      QueueUrl,
      MessageBody: JSON.stringify(rejection)
    })
  );
};
