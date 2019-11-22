const errorMessages = require('./error-messages.json');

const decorateError = props => {
	const error = new Error();
	Object.assign(error, props);
	return error;
};

const ingestError = (code, props) =>
	decorateError({
		message: errorMessages[code],
		code,
		...props,
	});

module.exports = { ingestError };
