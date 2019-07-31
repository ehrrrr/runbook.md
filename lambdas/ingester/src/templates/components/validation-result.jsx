const { h, Fragment } = require('hyperons');
const { ScoreTile } = require('./score-tile');

const {
	Message,
	ParseSuccess,
	ParseErrors,
	ValidationErrors,
	UpdatedFields,
} = require('./output-fields');

const { BIZ_OPS_URL } = process.env;

exports.ValidationResult = ({
	status,
	alertState,
	weightedScore,
	writeToBizOps,
	systemCode,
	message,
	parseData = {},
	parseErrors = [],
	validationErrors = {},
	updatedFields = {},
	refreshLink,
}) => (
	<Fragment>
		<h2 id="validation-result">Validation Result</h2>
		{refreshLink && (
			<aside>
				<p>
					<a href="/runbook.md">Click here</a> to validate another
					runbook.
				</p>
			</aside>
		)}
		{!parseErrors.length && (
			<div className="o-grid-row fullwidth with-margin-bottom">
				<div data-o-grid-colspan="12">
					<ScoreTile value={weightedScore} />
				</div>
			</div>
		)}
		<div className="o-grid-row fullwidth with-margin-bottom">
			<div data-o-grid-colspan="12">
				{message && message.length > 0 && (
					<Message
						alertState={alertState}
						message={message}
						linkText={
							status === 200 &&
							writeToBizOps &&
							'View updated Biz Ops record'
						}
						linkUrl={
							status === 200 &&
							writeToBizOps &&
							`${BIZ_OPS_URL}/System/${systemCode}`
						}
					/>
				)}
				{parseErrors.length > 0 && <ParseErrors errors={parseErrors} />}
				{Object.entries(validationErrors).length > 0 && (
					<ValidationErrors errors={validationErrors} />
				)}
				{Object.entries(parseData).length > 0 && (
					<ParseSuccess data={parseData} />
				)}
				{Object.entries(updatedFields).length > 0 && (
					<UpdatedFields data={updatedFields} />
				)}
			</div>
		</div>
	</Fragment>
);
