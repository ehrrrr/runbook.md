const querystring = require('querystring');
const { githubAPI } = require('../../lib/github-client');

const postIssue = ({
	commit,
	repository,
	githubName,
	errorCause,
	systemCode,
	traceId,
}) => {
	const author = githubName ? ` (FYI, @${githubName})` : '';
	const commitUrl = `[#${commit.slice(
		0,
		7,
	)}](https://github.com/${repository}/commit/${commit})`;
	const splunkQuery = `index=aws_cloudwatch source="/aws/lambda/biz-ops-runbook-md-prod-releaseLog" traceId="${traceId}"`;
	const path = `/repos/${repository}/issues`;

	const requestOptions = {
		method: 'POST',
		body: JSON.stringify({
			title: 'runbook.md automated runbook ingestion failure',
			body: `There was an error synchronising runbook data with Biz-Ops: 

            \`\`\`
            ${errorCause}
            \`\`\`

            This automated operation was triggered by a recent release - commit ${commitUrl}${author}.
            You can find further details about what went wrong on [Splunk](https://financialtimes.splunkcloud.com/en-GB/app/search/search?q=search%20${querystring.escape(
				splunkQuery,
			)}).
            
            Need help? Slack us in [#reliability-eng](https://financialtimes.slack.com/archives/C07B3043U)

            Please check [your most recent production runbook](https://runbooks.in.ft.com/${systemCode}) and alert Operations if any critical details are missing.

            Issue posted automatically by [runbook.md](https://github.com/Financial-Times/runbook.md).`,
		}),
	};
	return githubAPI(path, requestOptions);
};

module.exports = { postIssue };
