const querystring = require('querystring');
const { githubAPI } = require('../../lib/github-client');

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
	const splunkQuery = querystring.escape(
		`index=aws_cloudwatch source="/aws/lambda/biz-ops-runbook-md-prod-releaseLog" traceId="${traceId}"`,
	);
	const path = `/repos/${repository}/issues`;

	const body = `# There was an error synchronising runbooks with Biz-Ops
> 🔴 ${errorCause}
## System code: [${systemCode}](https://biz-ops.in.ft.com/System/${systemCode})

* This operation was triggered by a production release: ${commitUrl}${author}.
* You can find further details about what went wrong on [Splunk](https://financialtimes.splunkcloud.com/en-GB/app/search/search?q=search%20${splunkQuery}). 
* You may **trigger the re-ingestion of any valid runbooks** via the associated [runbook.md check run](${checkRunUrl}). 

Please check the [most recent production runbook](https://runbooks.in.ft.com/${systemCode}) and alert Operations if any critical details are missing.

-------------

Issue posted automatically by [runbook.md](https://github.com/Financial-Times/runbook.md). Need help? Slack us in [#reliability-eng](https://financialtimes.slack.com/archives/C07B3043U)`;

	const requestOptions = {
		method: 'POST',
		body: JSON.stringify({
			title: 'runbook.md automated runbook ingestion failure',
			body,
		}),
	};

	return githubAPI()(path, requestOptions);
};

module.exports = { postIssue };
