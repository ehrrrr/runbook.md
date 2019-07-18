const { h, Fragment } = require('hyperons');

const { RunbookOutput } = require('./components/output-fields');

const { ValidationResult } = require('./components/validation-result');

const StatusPage = ({
	owner,
	repo,
	hash,
	alertState,
	message,
	commitUrl,
	runbookUrl,
	content,
	weightedScore,
	parseData = {},
	parseErrors = [],
	validationErrors = {},
	updatedFields = {},
}) => (
	<Fragment>
		<div className="o-layout__sidebar" />
		<div className="o-layout__main o-layout-typography runbook-form">
			<h1 id="edit-form--title">Runbook Report</h1>
			<p className="o-forms-title" aria-hidden="true">
				{owner} &raquo; {repo} &raquo;
				<span className="o-forms-title__main">
					<a
						href={commitUrl}
						target="_blank"
						rel="noopener noreferrer"
					>
						{hash} &raquo;
					</a>
				</span>
			</p>
			<ValidationResult
				alertState={alertState}
				message={message}
				parseData={parseData}
				parseErrors={parseErrors}
				validationErrors={validationErrors}
				updatedFields={updatedFields}
				weightedScore={Number(weightedScore).toFixed(1)}
			/>
			<h2 id="runbook-input">RUNBOOK.MD Content</h2>
			<div className="o-grid-row fullwidth with-margin-bottom">
				<div data-o-grid-colspan="12">
					<RunbookOutput content={content} runbookUrl={runbookUrl} />
				</div>
			</div>
		</div>
	</Fragment>
);

module.exports = StatusPage;
