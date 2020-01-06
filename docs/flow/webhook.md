%% Mermaid graph definition - https://mermaidjs.github.io/#/flowchart

graph TD
    start>fab:fa-github commit / branch / tag push] --> lambda(runbook.md webhook)
    lambda -->|commit hash & repo name| sourcer{fas:fa-search *runbook.md files<br/>found in tree?}
    sourcer -->|no| sourcer_bail((fas:fa-sign-out-alt BAIL))
    sourcer -->|yes| sourcer_filter{fas:fa-filter filter out runbooks<br/>excluded via config<br/>- any left?}
    sourcer_filter -->|no| sourcer_bail

    sourcer_filter -->|yes / no config| process_runbook[parse & validate<br>each runbook]

    process_runbook --> process_runbook_save{fas:fa-database results stored<br/>successfully?}
    process_runbook_save -->|no|process_runbook_skip((fas:fa-forward SKIP))
    process_runbook_save -->|yes|gatherer[\fas:fa-tasks summarise results for<br/>all runbooks/]

    process_runbook --> process_ingest{far:fa-save Biz Ops update<br>enabled in config?}
    process_ingest --> |no / no config|process_ingest_skip((DO NOTHING))
    process_ingest --> |yes|process_ingest_system_code_check{fas:fa-code system code<br>valid?}
    process_ingest_system_code_check -->|no| process_ingest_skip
    process_ingest_system_code_check --> |yes|process_ingest_update_biz_ops{fas:fa-save Biz Ops ingest<br>successful?}
    process_ingest_update_biz_ops -.-> |yes| gatherer
    process_ingest_update_biz_ops --> |no| process_ingest_update_biz_ops_failed[fab:fa-github post repo issue]

    gatherer --> gatherer_check_run["fab:fa-github post check run result<br/>(fas:fa-link Details... page)"]
    gatherer_check_run -->gatherer_commit_status["fab:fa-github post commit status<br/>(overall fas:fa-times / fas:fa-check)"]
