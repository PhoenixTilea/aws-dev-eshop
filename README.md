# AWS EShop API

This is the EShop app I'm developing while going through the [AWS Developer Learning Plan](https://skillbuilder.aws/learning-plan/8ZTS6X8W2U/aws-developer-learning-plan) on AWS Skill Builder. However, the learning plan uses Python, and I don't want to also learn Python at the same time, so this project is built with TypeScript and Node.

I'll be updating the main branch each time I finish a phase of the learning plan, along with the list of services and general state of the app here.

Note that while I'm following the modules, I want this to also be a sample of how i code. Not being able to copy/paste the python code from the modules helps here; this is genuinely what my TypeScript code looks like.

## Current State

- [x] Phase 1: Basic CRUD API with Lambda and API Gateway, persistent storage with DynamoDB, basic testing and error handling
- [ ] Phase 2
- [ ] Phase 3
- [ ] Phase 4
- [ ] Phase 5
- [ ] Phase 6

## AWS Services Used

- API Gateway
- CDK (Cloud Developer Kit)
- DynamoDB
- Lambda

## Tech Stack

- Language and Environment: TypeScript, Node
- Package Manager: PNPM
- SDKs: AWS SDK for JavaScript, AWS CDK Lib
- Validation: Zod
- Testing: Vitest, TestContainers (for integration tests with docker images)
- Linting and Formatting: EsLint, Prettier
- Tools: Swagger/OpenAPI

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
cdk synth --all

# Deploy the stacks (Might need to answer 'y' to a prompt)
cdk deploy --all
```

From here, I recommend copying the `ProductsApiUrl` output for the API gateway endpoint (should end in `/dev/`). You'll need it for the Swagger page below, or if you want to test the API using CURL or another API client.

### Try the Deployed API with Swagger

There's a small Express server in `tools/swagger` that serves a Swagger page for the deployed API. The spec is generated from the route contracts and Zod schemas in `src/api`, so it stays in sync as routes get added. "Try it out" requests go straight from your browser to API Gateway.

The server needs to know where the API lives, so set `API_BASE_URL` to the `ProductsApiUrl` output first. The easiest way is a `.env` file in the project root (it's gitignored):

```Bash
API_BASE_URL=https://abc123.execute-api.us-east-1.amazonaws.com/dev/
```

Or set it in your shell for the current session:

```Bash
# Bash
export API_BASE_URL=https://abc123.execute-api.us-east-1.amazonaws.com/dev/

# PowerShell
$env:API_BASE_URL = "https://abc123.execute-api.us-east-1.amazonaws.com/dev/"
```

If you've lost the URL, you can get it back from the stack outputs:

```Bash
aws cloudformation describe-stacks --stack-name ProductsApiStack --query "Stacks[0].Outputs"
```

Then launch the docs server:

```Bash
# Serves the docs at http://localhost:4000/docs (set PORT to use a different port)
# Restarts automatically when you change a route or schema
pnpm swagger

# Or write the spec to openapi.json, to import into an API client
pnpm spec
```

### Testing

```Bash
# Unit tests
pnpm test

# Integration Tests (requires docker)
pnpm test:integration

# Get coverage report
pnpm test:coverage
```
