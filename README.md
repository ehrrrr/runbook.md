# runbook.md

runbook.md is a toolchain for improving the quality of runbooks across the business, and ensuring consistency of the information contained within runbooks with [biz-ops](https://biz-ops.in.ft.com/) – the knowledge base which models our business operations.

[Quickstart](https://biz-ops.in.ft.com/runbook.md/docs/quickstart)

Talk to us in the [#reliability-eng](https://financialtimes.slack.com/archives/C07B3043U) channel on Slack if you have any questions / suggestions.

## Toolchain

### Automated ingestion on publishing of release logs

All systems which integrate with [Change API](https://github.com/Financial-Times/change-api#change-api---v2) benefit from automated `runbook.md` ingestion and synchronisation with [biz-ops](https://biz-ops.in.ft.com/), on every release that contains changes to a `runbook.md` file.

Please add Change API to your deployment pipeline and release your code.
A successful journey will see any `runbook.md` file changes automatically applied in Biz Ops to the relevant system(s).

Here is the workflow: ![workflow](./docs/changeApiRunbookMdWorkflow.png)

### GitHub app (beta)

The [runbook.md github app](https://github.com/organizations/Financial-Times/settings/installations/1210233) validates a repository's RUNBOOK.MD files - Markdown files following the `/runbook.md$/i` naming convention - against our organisation-wide standard, and offers suggestions for improvement.

For manual release processes or multi-system repositories, where integrating with
[Change API](https://github.com/Financial-Times/change-api#change-api---v2) is not possible, the GitHub app supports [custom configuration (example here)](./docs/example-runbooks.yml) for updating system information in Biz-Ops.

For repositories containing source code for more than one system, please adhere to a `system-code_runbook.md` naming convention (where `system-code` is the `systemCode` as written in Biz-Ops) or use [custom config](./docs/example-runbooks.yml) to map each runbook to a system.

![image](https://user-images.githubusercontent.com/12828487/62377885-8d4f6780-b53b-11e9-946b-49292d32f12d.png)

### Manual validation

This utility allows manual upload of a RUNBOOK.md file for validation and [operability scoring](https://github.com/Financial-Times/system-operability-score). Optionally, the tool can be used to populate associated critical fields in Biz Ops based on the content of a _valid runbook_.

See an example of the format/content of a RUNBOOK.md file [here](./docs/example-runbook.md).

## Installation and development

### Prerequisites

-   Ensure [Docker](https://docs.docker.com/) is installed and running
-   Ensure AWS CLI tooling is installed https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-install.html

Using [GNU Make](https://www.gnu.org/software/make/) as a task runner:

-   `make install` installs dependencies and add linting config files
-   `make env` populates an `.env` file with the appropriate environment variables from Vault
-   `make run` runs the app which you can then visit at http://localhost:3000/runbook.md
-   `make test` runs tests
-   `make verify` runs linter checks (with eslint, using prettier)

### Emulating Change API's release log message stream, offline

The task `make run-local-message-stream` sets up and starts an [offline emulation of AWS' Kinesis](https://github.com/mhart/kinesalite). You can put records onto the resulting stream – `change-request-api-test-enriched-stream` – using the following AWS CLI command.

```bash
aws kinesis --endpoint-url http://localhost:4567 \
   put-record --stream-name change-request-api-test-enriched-stream \
   --partition-key “MyFirstMessage” \
   --data [stringifiedJSONreleaseLog](https://github.com/Financial-Times/runbook.md/blob/master/docs/change-api-example-message.json)
```

### Troubleshooting common issues

The following error can occur when trying try to execute `make run`:

```js
{
   errno: 'ENOTFOUND',
   code: 'ENOTFOUND',
   syscall: 'getaddrinfo',
   hostname: 'local.in.ft.com'
}
```

In this case, check your `/etc/hosts` file and add the entry: `127.0.0.1 local.in.ft.com`.

### How systemCode is picked

The number is the priority. It will fallback if the value is `undefined`.

1. `Code` from runbook.md
2. `systemCodes` From .github/runbooks.yml config ([exapmle](./docs/example-runbooks.yml#L51))
3. From file name `${system-code}_runbook.md`
4. `systemCode` From Change API message **[Change API route only]**
