# Runbook.md

This utility offers the user the opportunity to create and upload a RUNBOOK.md file into Biz Ops to populate all the critical fields.

In this **BETA** implementation we offer both a GUI and a /ingest endpoint (to which you can POST RUNBOOK.md) content

See a sample of the format/content of the RUNBOOK.md file [here](./docs/example.md)

![image](https://user-images.githubusercontent.com/447559/58543123-b62f4580-81f6-11e9-8f9b-7d694d159e85.png)

## Installation and Development

Make is the general task runner

-   `make install` to install dependencies and add linting config files
-   `make env` to fetch environment vars from Vault
-   You need to download docker from https://docs.docker.com/ and make sure it's running
-   You also need to ensure AWS CLI is installed https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html
-   `make run` will run the app which you can then visit at http://localhost:3000/runbook.md
-   `make test` will run mocha unit tests
-   `make lint` will run eslint, using prettier

## Send record to kinesis stream

In Makefile the run task set up the offline kinesis environment and create the stream called `change-request-api-test-enriched-stream`.
If you want to put a record on the stream you can run the following command.

```bash
aws kinesis --endpoint-url http://localhost:4567 put-record --stream-name change-request-api-test-enriched-stream  --partition-key “MyFirstMessage” --data "{\"systemData\":{\"name\":\"Biz Ops Search\",\"SF_ID\":\"a22D0000002ugnxIAA\",\"serviceTier\":\"Bronze\",\"dataOwner\":{\"email\":\"rhys.evans@ft.com\"},\"supportedBy\":{\"email\":\"reliability.engineering@ft.com\"},\"repositories\":{\"code\":\"github:Financial-Times/biz-ops-api\"},\"deliveredBy\":{\"productOwners\":[{\"email\":\"sarah.wells@ft.com\"}],\"group\":{\"code\":\"operationsreliability\",\"name\":\"Operations & Reliability\"}}},\"githubData\":{\"title\":\"Fix change type in salesforce\",\"htmlUrl\":\"https://github.com/Financial-Times/change-api/pull/52\"},\"user\":{\"githubName\":\"testUser\",\"email\":null},\"environment\":\"production\",\"systemCode\":\"biz-ops-search\",\"commit\":\"c50128fc67f055356d4171f570aa2600e42dc2d1\",\"timestamp\":\"2019-06-18T09:38:44.286Z\",\"loggerContext\":{\"traceId\":\"e3860769-3341-4ea2-b29e-c9d96c260f13\",\"clientSystemCode\":\"biz-ops-search\"},\"isProdEnv\":true,\"salesforceSystemId\":\"a22D0000002ugnxIAA\"}"
```

## Troubleshooting

The following error can occur when trying try to exectute `make run`:

```{
[0]   errno: 'ENOTFOUND',
[0]   code: 'ENOTFOUND',
[0]   syscall: 'getaddrinfo',
[0]   hostname: 'local.in.ft.com'
[0] }
```

In this case, check your `/etc/hosts` file and add the following entry
`127.0.0.1 local.in.ft.com`
