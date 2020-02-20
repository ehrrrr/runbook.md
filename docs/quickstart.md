# RUNBOOK.md quickstart

## 1. Create one or more RUNBOOK.md files

If your repository contains source code for a single system, create a single RUNBOOK.md file in the project root.

If your repository contains source code for multiple systems, for each system create a RUNBOOK.md file prefixed with the system code and an underscore, e.g. `access-svc_RUNBOOK.md`

These files can be in a subdirectory of your choice if you wish (e.g. `/docs`), but we recommend using the project root for visibility and consistency across our tech estate.

## 2. Understand the RUNBOOK.md structured format

A summary of the format is as follows

-   The first h1 is the name (not the code) of the system.
-   The paragraph under the h1 is the system description. It may contain markdown, but should only be a single paragraph.
-   Any h2’s define field names, and the content beneath them is the value to store in that field.
-   Any fields that refer to relationships between records must either contain a single valid code (usually a system code or team code) from Biz Ops, or a markdown list of codes.
-   Any fields that contain ‘subdocument’ blocks of text e.g troubleshooting docs, must not contain any headers stronger than h3.

There is a little bit more to it than that, but the points above will be enough to get you started.

## 3. Invest some time adding relationships to your system

If you edit all the relationships to your system (e.g. ownership, dependencies) on the [Biz Ops site](https://biz-ops-in.ft.com) _before_ using the RUNBOOK.md generator it will mean you get the benefit of using the autocomplete in the UI, and therefore won't have to be careful typing each system code, team code etc into your RUNBOOK.md manually.

## 4. Generate your RUNBOOK.md content

At the top of every system page in Biz Ops is a link to generate RUNBOOK.md file generated from existing Biz ops content. If you click it it will take you to a generated RUNBOOK.md file. (Alternatively, visit the [RUNBOOK.md generator](https://biz-ops.in.ft.com/runbook.md) directly).

This generated file will contain all the fields expected in a good runbook. If Biz Ops contains a value for this field, this value will be output by the generator. Otherwise there will be a html comment with some hints of what to enter.

If a field is irrelevant to your system, delete both the html comment and the heading above it, otherwise type in the appropriate information for this field.

## 5. Validate your runbook's quality

There are 2 tools for validating the runbook content.

-   The [RUNBOOK.md generator](https://biz-ops.in.ft.com/runbook.md) has a form for manually running your content through the RUNBOOK.md app to validate it.
-   All PRs in the main FT account run a RUNBOOK.md check, and results will be reported on the PR.

![image](https://user-images.githubusercontent.com/447559/74748217-10c67100-5260-11ea-9d43-0000d12b38c6.png)

There are 2 types of validation:

-   Parse, which will complain if any fields contains invalid content
-   SOS, which scores your runbook against [System Operability Score](https://sos.in.ft.com) rules to verify the content meets basic minimum standards

Parse failures prevent publishing to Biz Ops, but SOS failures don't.

## 6. Publish to Biz Ops

### Full automation

If you have a fully automated release process, you will need to integrate your project with the [Change API](https://github.com/Financial-Times/change-api/blob/master/docs/API_DEFINITION.md), sending change logs for every system whose code lives in the repository. This will automatically ingest the RUNBOOK.md (if parsing is successful) from the production branch/tag into Biz Ops. This also works for the scenario where the repository contains runbooks for multiple systems.

### Manual step

Assuming you want the master branch to be the source of truth for your runbook, add a `./.github/runbooks.yaml` file to your repository with the following content.

```yaml
runbooks:
    updateOnMerge: true
    updateBranch: master
```

[More options are available](https://github.com/Financial-Times/runbook.md/blob/master/docs/example-runbooks.yml) to fine tune runbook publishing.

## 7. Check your content on https://runbooks.in.ft.com

Hopefully there will be no issues, but if there are let us know in the [#reliability-eng](https://financialtimes.slack.com/archives/C07B3043U) slack channel.
