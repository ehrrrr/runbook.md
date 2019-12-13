const qs = require('querystring');
const { githubAPI } = require('../../lib/github-client');

const { BIZ_OPS_URL, RUNBOOKS_URL, NODE_ENV } = process.env;

const ISSUE_SPLUNK_QUERY =
	NODE_ENV === 'production'
		? 'index=aws_cloudwatch source="/aws/lambda/biz-ops-runbook-md-prod-release"'
		: 'index=aws_cloudwatch_dev source="/aws/lambda/biz-ops-runbook-md-test-release"';

const ISSUE_TITLE = 'runbook.md automated runbook ingestion failure';

const postIssue = ({
	checkRunUrl,
	commit,
	repository,
	githubName,
	errorCause,
	systemCode,
	traceId,
}) => {
	const truncatedCommit = commit.slice(0, 7);
	const author = githubName ? ` (FYI, @${githubName})` : '';
	const commitUrl = `[#${truncatedCommit}](https://github.com/${repository}/commit/${commit})`;
	const splunkQuery = qs.escape(`${ISSUE_SPLUNK_QUERY} traceId="${traceId}"`);
	const path = `/repos/${repository}/issues`;

	const title = `${ISSUE_TITLE}${
		NODE_ENV === 'production' ? '' : ' (staging)'
	}`;
	const body = `# There was an error synchronising runbooks with Biz Ops
> :red_circle: ${errorCause}
## System code: [${systemCode}](${BIZ_OPS_URL}/System/${systemCode})

* This operation was triggered by a production release: ${commitUrl}${author}.
* You can find further details about what went wrong on [Splunk](https://financialtimes.splunkcloud.com/en-GB/app/search/search?q=search%20${splunkQuery}).
* You may **trigger the re-ingestion of any valid runbooks** via the associated [runbook.md check run](${checkRunUrl}).

Please check the [most recent production runbook](${RUNBOOKS_URL}/${systemCode}) and alert Operations if any critical details are missing.

-------------

Issue posted automatically by [runbook.md](https://github.com/Financial-Times/runbook.md). Need help? Slack us in [#reliability-eng](https://financialtimes.slack.com/archives/C07B3043U)`;

	const requestOptions = {
		method: 'POST',
		body: JSON.stringify({ title, body }),
	};

	return githubAPI()(path, requestOptions);
};

module.exports = { postIssue };
