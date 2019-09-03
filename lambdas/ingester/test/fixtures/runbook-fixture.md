<!--
    Written in the format prescribed by https://github.com/Financial-Times/runbook.md.
    Any future edits should abide by this format.
-->

# Test Runbook MD Runbook

A HTTP API which scrapes the Pingdom API returns a response in the Prometheus metrics format, with each Pingdom check/transaction check exposed with separate metrics.

## Primary URL

<https://runbook.md.in.ft.com>

## Service Tier

Platinum

## Lifecycle Stage

Production

## Host Platform

AWS ECS

## Delivered By

[reliability-engineering](https://biz-ops.in.ft.com/Team/reliability-engineering)

## Supported By

[reliability-engineering](https://biz-ops.in.ft.com/Team/reliability-engineering)

## First Line Troubleshooting

Check whether the [Pingdom API is available](https://status.pingdom.com/).

## Second Line Troubleshooting

Nothing further to add.

## Bespoke Monitoring

The Heimdall Prometheus has some bespoke alarms which are sent to the [#rel-eng-alerts](https://financialtimes.slack.com/messages/C8QL0GY9J) Slack via alertmanager.

## Contains Personal Data

False

## Contains Sensitive Data

False

## Architecture

Diagram for the pingdom exporter:

## Dependencies

-   [pingdom](https://biz-ops.in.ft.com/System/pingdom)

## Failover Architecture Type

ActiveActive

## Failover Process Type

FullyAutomated

## Failback Process Type

FullyAutomated

## Data Recovery Process Type

NotApplicable

## Data Recovery Details

Not applicable.

## Release Process Type

FullyAutomated

## Rollback Process Type

Manual
