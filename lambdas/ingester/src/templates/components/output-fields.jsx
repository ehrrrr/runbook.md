const { h } = require('hyperons');
const addLineNumbers = require('add-line-numbers');
const { Table } = require('./table');

exports.Message = ({ alertState, message, linkText, linkUrl }) => (
	<div
		className={`o-message with-margin-bottom o-message--alert o-message--${alertState}`}
		data-o-component="o-message"
	>
		<div className="o-message__container">
			<div className="o-message__content">
				<p className="o-message__content-main">{message}</p>
				{linkUrl && linkText && (
					<div className="o-message__actions">
						<a
							href={`${linkUrl}`}
							className="o-message__actions__secondary"
						>
							{linkText}
						</a>
					</div>
				)}
			</div>
		</div>
	</div>
);

exports.UpdatedFields = ({ data }) => {
	const tableProps = {
		caption: 'Updated Biz Ops Fields',
		columns: ['Property', 'Value'],
		rows: Object.entries(data),
	};
	return (
		<div className="updated-fields">
			<Table {...tableProps} />
		</div>
	);
};

exports.ParseSuccess = ({ data }) => {
	const tableProps = {
		caption: 'Parse Successes',
		columns: ['Property', 'Value'],
		rows: Object.entries(data),
	};
	return (
		<div className="parsed-data">
			<Table {...tableProps} />
		</div>
	);
};

exports.ParseErrors = ({ errors }) => {
	const tableProps = {
		caption: 'Parse Errors',
		columns: ['Message'],
		rows: errors.map(({ line, message }) => [
			line ? `${message} on or around line ${line}` : message,
		]),
	};
	return (
		<div className="parsed-errors">
			<Table {...tableProps} />
		</div>
	);
};

exports.ValidationErrors = ({ errors }) => {
	const tableProps = {
		caption: 'Validation Errors',
		columns: ['Facet', 'Errors'],
		rows: Object.entries(errors).map(([facet, messages]) => [
			facet,
			{
				props: { className: 'with-line-breaks' },
				value: messages,
			},
		]),
	};
	return (
		<div className="validation-errors">
			<Table {...tableProps} />
		</div>
	);
};

exports.RunbookOutput = ({ content, runbookUrl }) => {
	const id = 'runbookContent';

	return (
		<div className="o-forms-field" aria-labelledby={`${id}-info`}>
			<span className="o-forms-title" aria-hidden="true">
				<span className="o-forms-title__prompt" id={`${id}-info`}>
					<a
						href={runbookUrl}
						target="_blank"
						rel="noopener noreferrer"
					>
						View on github &raquo;
					</a>
				</span>
			</span>
			<span className="o-forms-input o-forms-input--textarea runbook-form__markdown-input">
				{' '}
				<textarea
					className="o-forms__textarea"
					name="content"
					id="content"
					rows="20"
					placeholder={content}
					data-original-content={content}
					readOnly
				>
					{addLineNumbers(content)}
				</textarea>
			</span>
		</div>
	);
};
