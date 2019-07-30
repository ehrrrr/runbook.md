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

The exporter can be accessed directly either via the [Dyn GSLB](https://prometheus-pingdom-exporter.in.ft.com) or in the [EU](https://prometheus-pingdom-exporter-eu-west-1.in.ft.com) or [US](https://prometheus-pingdom-exporter-us-east-1.in.ft.com) specifically.

A few useful queries can be ran to determine what the exporter is returning, if anything. These can be run either in the [Prometheus console](http://prometheus.in.ft.com/) or the [Grafana explore UI](https://grafana.ft.com/explore?left=%5B%22now-6h%22,%22now%22,%22Operations%20%26%20Reliability%20Prometheus%22,%7B%7D,%7B%22ui%22:%5Btrue,true,true,%22none%22%5D%7D%5D).

-   Is the exporter down, or has it been down recently?

    ```promql
    up{job="pingdom"} == 0
    ```

    `== 0` for down, `== 1` for up.

    If this is down it suggests either a problem with the connectivity between Prometheus and the exporter, or that the exporter is not responding.

-   Is the Pingdom API down, or has it been down recently?

    ```promql
    pingdom_up{job="pingdom"} == 0
    ```

    `== 0` for down, `== 1` for up.

    If this is down it suggests either a problem with the connectivity between the exporter and Pingdom, bad credentials between the two, or a problem with the Pingdom API.

-   Are the expected checks being fetched in the numbers expected?

    ```promql
    count(pingdom_check_status)
    ```

    The values for this metric can be drilled into by searching without `count`. The meanings of values are described in the [README](./README.md#pingdom_check_status`).

View the generic troubleshooting information for the AWS ECS cluster (including services running on the cluster) which the application runs on: [monitoring-aggregation-ecs](https://github.com/Financial-Times/monitoring-aggregation-ecs/blob/master/documentation/RUNBOOK.md).

## Second Line Troubleshooting

Nothing further to add.

## Bespoke Monitoring

The Heimdall Prometheus has some bespoke alarms which are sent to the [#rel-eng-alerts](https://financialtimes.slack.com/messages/C8QL0GY9J) Slack via alertmanager.

These are visible in the [Alertmanager UI](https://alertmanager.in.ft.com/) if they are firing.

There are several Grafana dashboards:

-   [AWS ECS Task metrics](http://grafana.ft.com/d/YCsaeAFiz/aws-ecs-operations-and-reliability?orgId=1&var-region=eu-west-1&var-cluster=mon-agg-ecs&var-service=mon-agg-ecs-service-prometheus-pingdom-exporter-Service-RGKFT0P8YF3W) (`us-east-1` metrics are available using the dropdowns).
-   [Go language runtime metrics](http://grafana.ft.com/d/c0mUzOcmz/go-processes?orgId=1&var-system=prometheus-pingdom-exporter&var-cluster_name=All&var-container=prometheus-pingdom-exporter-service&var-task_revision=All&var-instance=All&var-interval=10m)

Logs are available in [Splunk](https://financialtimes.splunkcloud.com/en-GB/app/search/search?q=search%20index%3D%22operations-reliability%22%20%09attrs.com.ft.service-name%3D%22prometheus-pingdom-exporter-service%22%20attrs.com.ft.service-region%3D%22*%22&display.page.search.mode=verbose&dispatch.sample_ratio=1&earliest=-1d&latest=now&sid=1561560909.4952678) via the query:

```splunk
index="operations-reliability" attrs.com.ft.service-name="prometheus-pingdom-exporter-service" attrs.com.ft.service-region="*"
```

## Contains Personal Data

False

## Contains Sensitive Data

False

## Architecture

Diagram for the pingdom exporter:

![pingdom-architecture-diagram](./documentation/architecture-diagrams/pingdom-architecture.png)

[View in Lucidchart](https://www.lucidchart.com/invitations/accept/cc02e6d3-5b7d-4859-b17e-a051e8a068a5).

Note: This setup is mirrored in `eu-west-1` and `us-east-1` regions, and fronted by a Dyn GSLB.

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

## Release Details

Release:

-   Merge a commit to master
-   [CircleCI](https://circleci.com/gh/Financial-Times/workflows/prometheus-pingdom-exporter) will build and deploy the commit.

Rollback:

-   Open CircleCI for this project: [circleci:prometheus-pingdom-exporter](https://circleci.com/gh/Financial-Times/workflows/prometheus-pingdom-exporter)
-   Find the build of the commit which you wish to roll back to. The commit message is visible, and the `sha` of the commit is displayed to the right
-   Click on `Rerun`, under the build status for each workflow
-   Click `Rerun from beginning`

## Key Management Process Type

Manual

## Key Management Details

The systems secrets are set at build time as parameters in the services Cloudformation template.

They come from two sources:

1. The CircleCI environment variables for the CircleCI project.
2. The CircleCI context used in the [CircleCI config](./circleci/config.yml).

See the [README](./README.md) for more details.
