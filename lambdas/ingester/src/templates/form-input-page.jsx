const { h, Fragment } = require('hyperons');

const {
	SystemCode,
	WriteFlag,
	ApiKey,
	RunbookEntry,
	RunbookImport,
} = require('./components/input-fields');

const { ValidationResult } = require('./components/validation-result');

const ValidateForm = ({
	status,
	systemCode,
	writeToBizOps,
	bizOpsApiKey,
	placeholder,
	readOnly,
	content,
	message,
	parseData = {},
	parseErrors = [],
	validationErrors = {},
	updatedFields = {},
	weightedScore,
}) => (
	<Fragment>
		<div className="o-layout__sidebar" />

		<form
			method="POST"
			className="o-layout__main o-layout-typography runbook-form"
			id="manualRunbookEntry"
		>
			<h1 id="edit-form--title">Parse, Validate and Import</h1>
			{readOnly && (
				<ValidationResult
					refreshLink
					alertState={status === 200 ? 'success' : 'error'}
					status={status}
					systemCode={systemCode}
					message={message}
					parseData={parseData}
					parseErrors={parseErrors}
					validationErrors={validationErrors}
					updatedFields={updatedFields}
					weightedScore={weightedScore}
				/>
			)}
			<h2 id="runbook-input">
				Runbook Content{systemCode ? ` for ${systemCode}` : ''}
			</h2>
			<div className="o-grid-row fullwidth with-margin-bottom">
				<div data-o-grid-colspan="12">
					<RunbookImport content={content} />
					<RunbookEntry
						placeholder={placeholder}
						content={content}
						readOnly={readOnly}
					/>
				</div>
			</div>

			<aside>
				<p>
					If you have enabled writing to Biz-Ops, this action will
					also update any valid System fields.
				</p>
				<p className="runbook-form__submit--error">
					Please complete all fields before submitting.
				</p>
				<button
					className="o-buttons o-buttons--primary o-buttons--mono o-buttons--big"
					type="submit"
					id="submitRunbookForm"
				>
					{readOnly ? `Resubmit` : `Submit`}
				</button>
			</aside>
			<h2 id="biz-ops-settings">Update Biz-Ops</h2>
			<div className="o-grid-row">
				<div data-o-grid-colspan="12">
					<WriteFlag writeToBizOps={writeToBizOps} />
				</div>
			</div>
			<div className="o-grid-row">
				<div data-o-grid-colspan="6">
					<SystemCode systemCode={systemCode} />
				</div>
				<div data-o-grid-colspan="6">
					<ApiKey bizOpsApiKey={bizOpsApiKey} />
				</div>
			</div>
		</form>
	</Fragment>
);

module.exports = ValidateForm;
