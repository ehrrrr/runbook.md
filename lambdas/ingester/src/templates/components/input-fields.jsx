const { h } = require('hyperons');
const addLineNumbers = require('add-line-numbers');
const { TextInput } = require('./text-input');
const { RadioButton } = require('./radio-button');
const { FormField } = require('./form-field');

const SystemCode = ({ systemCode }) => {
	const props = {
		title: 'System Code',
		info: `The system code associated with the runbook, as per Biz-Ops.`,
		id: 'systemCode',
	};

	props.content = (
		<TextInput id={props.id} name={props.id} value={systemCode} />
	);

	return <FormField {...props} />;
};

const ApiKey = ({ bizOpsApiKey }) => {
	const props = {
		title: 'Your Biz-Ops API Key',
		info: `A valid API key is required to update runbook information in Biz-Ops.`,
		id: 'bizOpsApiKey',
	};

	props.content = (
		<TextInput id={props.id} name={props.id} value={bizOpsApiKey} />
	);

	return <FormField {...props} />;
};

const WriteFlag = ({ writeToBizOps }) => {
	const props = {
		title: 'Write to Biz-Ops?',
		info: `Choosing 'Yes' updates Biz-Ops with the results of the validation. This requires a valid System Code and Biz-Ops API key.`,
		id: 'writeToBizOps',
		optional: true,
	};

	props.content = (
		<span className="o-forms-input o-forms-input--radio-box o-forms-input--inline">
			<div className="o-forms-input--radio-box__container">
				<RadioButton
					id={props.id}
					label="Yes"
					value="yes"
					checked={writeToBizOps}
				/>
				<RadioButton
					id={props.id}
					label="No"
					value="no"
					checked={!writeToBizOps}
				/>
			</div>
		</span>
	);

	return <FormField {...props} />;
};

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

	return <FormField {...props} />;
};

const RunbookImport = ({ content }) => {
	return content ? null : (
		<label className="o-forms-field" id="import-or-manual">
			<span className="o-forms-title">
				<span htmlFor="system-code" className="o-forms__label">
					Enter a system code to import a runbook.md from existing Biz
					Ops data
				</span>
			</span>

			<span className="o-forms-input o-forms-input--text o-forms-input--small o-forms-input--suffix">
				<input type="text" id="import-system-code" name="systemCode" />

				<button
					id="import-from-biz-ops"
					type="button"
					className="o-buttons o-buttons--primary"
				>
					Import
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
	SystemCode,
	WriteFlag,
	ApiKey,
	RunbookEntry,
	RunbookImport,
};
