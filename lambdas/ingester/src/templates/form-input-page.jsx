const { h, Fragment } = require('hyperons');

const { RunbookEntry, RunbookImport } = require('./components/input-fields');

const { ValidationResult } = require('./components/validation-result');

const ValidateForm = ({
	status,
	systemCode,
	systemCodeExists,
	placeholder,
	readOnly,
	message,
	content,
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
					<RunbookImport
						content={content}
						systemCode={systemCode}
						systemCodeExists={systemCodeExists}
					/>
					<RunbookEntry
						placeholder={placeholder}
						content={content}
						readOnly={readOnly}
					/>
				</div>
			</div>

			<aside>
				<p>
					Submit to validate and get an SOS score for your runbook.md
				</p>
				<button
					className="o-buttons o-buttons--primary o-buttons--mono o-buttons--big"
					type="submit"
					id="submitRunbookForm"
					disabled
				>
					{readOnly ? `Resubmit` : `Submit`}
				</button>
			</aside>
			<h2>What next?</h2>
			<p>
				Once you are happy with what you&apos;ve written here, save it
				as <strong>RUNBOOK.md</strong> in your project repository (or{' '}
				<strong>system-code_runbook.md</strong> if your repository
				contains multiple runbooks, where <strong>system-code</strong>{' '}
				matches an existing Biz Ops systemCode). You will also need to
				hook up your project to{' '}
				<a href="https://github.com/Financial-Times/change-api#integration-examples">
					Change API
				</a>
				. Any production releases which also include changes to the
				runbook content will then automatically result in Biz Ops and{' '}
				<a href="https://runbooks.in.ft.com">runbooks.in.ft.com</a>{' '}
				being updated with the new information.
			</p>
		</form>
	</Fragment>
);

module.exports = ValidateForm;
