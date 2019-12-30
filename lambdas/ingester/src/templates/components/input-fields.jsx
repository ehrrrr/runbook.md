const { h } = require('hyperons');
const addLineNumbers = require('add-line-numbers');
const { FormField } = require('./form-field');

const RunbookEntry = ({ placeholder, content, readOnly }) => {
	const props = {
		title: 'Your RUNBOOK.MD',
		info: `Paste or type the content of your runbook here, in Markdown.`,
		id: 'runbookContent',
	};

	props.content = (
		<span className="o-forms-input o-forms-input--textarea runbook-form__markdown-input">
			{' '}
			<textarea
				className="o-forms__textarea"
				name="content"
				id="content"
				rows="20"
				placeholder={placeholder}
				data-original-content={content}
				readOnly={readOnly}
			>
				{readOnly ? addLineNumbers(content) : content}
			</textarea>
		</span>
	);

	props.hidden = !content;

	// eslint-disable-next-line react/jsx-props-no-spreading
	return <FormField {...props} />;
};

const RunbookImport = ({ content, systemCode, systemCodeExists }) => {
	return content ? null : (
		<label className="o-forms-field" id="import-or-manual">
			<span className="o-forms-title">
				<span htmlFor="system-code" className="o-forms__label">
					Enter an <b>existing</b> system code to create a runbook.md
					from Biz Ops data.{' '}
					{systemCode &&
						(systemCodeExists
							? ''
							: `We couldn't find the system code above in Biz Ops.`)}
				</span>
			</span>

			<span className="o-forms-input o-forms-input--text o-forms-input--small o-forms-input--suffix">
				<input type="text" id="import-system-code" name="systemCode" />

				<button
					id="import-from-biz-ops"
					type="button"
					className="o-buttons o-buttons--primary"
				>
					Create
				</button>
			</span>
			<span className="o-forms-title">
				<span className="o-forms__label">
					or{' '}
					{
						// using a link pending getting linky styles for buttons
					}
					<a id="enter-manually" href="#hack">
						manually write a new RUNBOOK.md from scratch
					</a>
				</span>
			</span>
		</label>
	);
};

module.exports = {
	RunbookEntry,
	RunbookImport,
};
