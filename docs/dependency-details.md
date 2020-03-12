# Adding details to dependency relationships

We have recently added support for adding additional information to dependency relationships.

In RUNBOOK.md dependencies are specified as follows:

```md
## Dependencies

-   biz-ops-api
-   biz-ops-schema
```

Now you can add 2 kinds of additional details:

-   resiliencePatterns: one or more specific architectural patterns that can make a dependency more resilient. Choose from the list: Cache, DurableCache, GracefulDegradation, Replay, ManualFallback
-   resilienceDetails: A free text field to explain more about how resilience is implemented

To add these to your markdown file use a format very similar to YAML. The resiliencePatterns should be comma-separated (with or without whitespace). Adding them is optional (though if you have a dependency on a system of a lower service tier, it will improve your SOS score if you fill out the information). e.g.

```md
## Dependencies

-   biz-ops-api
    resiliencePatterns: Cache, Replay
    resilienceDetails: Calls to Biz Ops are held in an in memory cache. The app consumes a kinesis stream, which replays events that cause the application to error.
-   biz-ops-schema
```

## More generally

This is the first example we've added to Biz Ops of adding properties directly onto relationships. This is a powerful addition to the graph model which you shoudl expect to see more of. The general pattern for adding these in RUNBOOK.md is

-   Put on the line immediately following the related record code.
-   Indent by two spaces or one tab
-   Use the exact property name as specified in the Biz Ops schema (we will work on surfacing this information in a more discoverable way first)
-   Text fields should be kept to a single line
-   List fields (such as 'resiliencePatterns' above) should be comma separated
-   All other types of fields (Boolean, Date, etc) follow the same conventions as top level RUNBOOK.md fields
