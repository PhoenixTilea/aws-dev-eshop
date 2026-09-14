# AWS EShop API

This is the EShop app I'm developing while going through the [AWS Developer Learning Plan](https://skillbuilder.aws/learning-plan/8ZTS6X8W2U/aws-developer-learning-plan) on AWS Skill Builder. However, the learning plan uses Python, and I don't want to also learn Python at the same time, so this project is built with TypeScript and Node.

I'll be updating the main branch each time I finish a phase of the learning plan, along with the list of services and general state of the app here.

Note that while I'm following the modules, I want this to also be a sample of how i code. Not being able to copy/paste the python code from the modules helps here; this is genuinely what my TypeScript code looks like.

## Current State

- [x] Phase 1: Basic CRUD API with Lambda and API Gateway, persistent storage with DynamoDB, basic testing and error handling
- [] Phase 2
- [] Phase 3
- [] Phase 4
- [] Phase 5
- [] Phase 6

## AWS Services Used

- API Gateway
- CDK (Cloud Developer Kit)
- DynamoDB
- Lambda

## Tech Stack

- Language and Environment: TypeScript, Node
- SDKs: AWS SDK for JavaScript, AWS CDK Lib
- Validation: Zod
- Testing: Vitest, TestContainers (for integration tests with docker images)
- Linting and Formatting: EsLint, Prettier

## Run it Yourself

### Prerequisites

- Node 24.x
- PNPM
- Docker, if you want to run the integration tests
- The AWS CLI and an account you don't mind throwing random resources at.
- The AWS CDK CLI installed globally
- This repository cloned via whatever method you typically use

Note: If you need guidance on getting these set up, check out the learning plan linked at the top of this README. I believe the Phase 0 module for setting up your environment is free to access. Just ignore the python stuff for this repo.

### Setup and Deploy

From the cloned project directory:

```Bash
# Install Deps
pnpm i

# Log into the AWS account you want to use
aws login

# Bootstrap the CDK environment for this account/region if you haven't already
cdk bootstrap

# Synthesize the templates without deploying
cdk synth ProductsDbStack, ProductsApiStack

# Deploy the stacks (Might need to answer 'y' to a prompt)
cdk deploy ProductsDbStack, ProductsApiStack
```

From here, I recommend copying the output for the API gateway endpoint (should end in `/dev/`). You'll need it if you want to test the API using CURL or another API client.

### Testing

```Bash
# Unit tests
pnpm test

# Integration Tests (requires docker)
pnpm test:integration

# Get coverage report
pnpm test:coverage
```

I don't yet have a fancy Swagger setup or anything for this, so if you want to test the real API, you'll want to use CURL or an API client like Postman or Yaak.

## API

Base URL: The endpoint output from the ProductsApiStack deployment.

### GET /products

Get all products in the catalog.

- Response: [Product](#Product)\[\]

### GET /product?category=

Get all products in a specific category.

- Query:
  - category: [Category](#Category)
- Response: [Product](#Product)\[\]

### GET /products/{id}

Get a single product by ID.

- Path:
  - id: UUID
- Response: [Product](#Product)

### POST /products

Add a new product to the catalog.

- Body: [ProductCreateData](#ProductCreateData)
- Response: [Product](#Product)

### PUT /products/{id}

Update a single product by ID.

- Path:
  - id: UUID
- Body: [ProductUpdateData](#ProductUpdateData)
- Response: [Product](#Product)

## Schemas

### Category

Enum: "Arrows", "Masks", "Potions", "Shields"

### Product

- id: UUID, auto-generated on create
- title: String, 1 to 200 characters
- description: String, 1 to 1000 characters
- category: [Category](#Category)
- price: Integer, must be greater than 0

### ProductCreateData

[Product](#Product) with `id` omitted.

### ProductUpdateData

[Product](#Product) with `id` and `category` omitted.
