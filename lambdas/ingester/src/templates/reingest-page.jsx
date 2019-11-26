const { h, Fragment } = require('hyperons');

const { RunbookOutput, Message } = require('./components/output-fields');
const { ScoreTile } = require('./components/score-tile');

const { BIZ_OPS_URL } = process.env;

const ReingestPage = ({
	systemCode,
	status,
	owner,
	repo,
	path,
	alertState,
	message,
	commitSha,
	commitUrl,
	checkRunUrl,
	url,
	content,
	details: { weightedScore } = {},
}) => (
	<Fragment>
		<div className="o-layout__sidebar" />
		<div className="o-layout__main o-layout-typography runbook-form">
			<h1 id="edit-form--title">Runbook Reingest</h1>
			<aside>
				<p>
					<b>
						<a href={checkRunUrl}>Click here</a> to return to the
						check run summary on GitHub.
					</b>
				</p>
				<p>
					Trigger commit:{' '}
					<a href={commitUrl}>{commitSha.slice(0, 6)}</a>
				</p>
			</aside>
			<p className="o-forms-title" aria-hidden="true">
				<span className="o-forms-title__main">
					{owner} &raquo; {repo} &raquo;{' '}
					<a href={url} target="_blank" rel="noopener noreferrer">
						{path} &raquo;
					</a>
				</span>
			</p>
			<div className="o-grid-row fullwidth with-margin-bottom">
				<div data-o-grid-colspan="12">
					<ScoreTile value={weightedScore} />
					{message && message.length > 0 && (
						<Message
							alertState={alertState}
							message={message}
							linkText={
								status === 200 && 'View updated Biz Ops record'
							}
							linkUrl={
								status === 200 &&
								`${BIZ_OPS_URL}/System/${systemCode}`
							}
						/>
					)}
				</div>
			</div>
			<h2 id="runbook-input">RUNBOOK.MD Content</h2>
			<div className="o-grid-row fullwidth with-margin-bottom">
				<div data-o-grid-colspan="12">
					<RunbookOutput content={content} runbookUrl={url} />
				</div>
			</div>
		</div>
	</Fragment>
);

module.exports = ReingestPage;
