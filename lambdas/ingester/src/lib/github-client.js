const logger = require('@financial-times/lambda-logger');
const fetch = require('isomorphic-fetch');
const https = require('https');

const GITHUB_API_URL = `https://api.github.com`;
const agent = new https.Agent({ keepAlive: true });

const githubAPI = (log = logger) => async (
	path,
	{ previewMode, ...options } = {},
	silentMode = false,
) => {
	const url = `${GITHUB_API_URL}${path.replace(GITHUB_API_URL, '')}`;
	const requestOptions = {
		...options,
		headers: {
			Authorization: `token ${process.env.GITHUB_AUTH_TOKEN}`,
			// The associated PRs endpoint on Commit API is currently in developer preview,
			// so we must provide a custom media type in the Accept header:
			...(previewMode
				? { Accept: 'application/vnd.github.groot-preview+json' }
				: {}),
		},
	};
	const response = await fetch(url, {
		...requestOptions,
		agent,
	});

	if (!response.ok) {
		requestOptions.headers.Authorization = `token: <redacted>`;
		if (!silentMode) {
			log.error({
				event: 'GITHUB_API_FAILURE',
				url,
				requestOptions,
				statusCode: response.status,
			});
		}
		throw new Error(
			`Github API call returned status code ${response.status}`,
		);
	}

	return response.json();
};

module.exports = { githubAPI };
