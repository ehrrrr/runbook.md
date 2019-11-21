const parseRepositoryName = (repository, htmlUrl) => {
	if (!repository) {
		if (!htmlUrl) {
			throw new Error('Invalid github reference URL');
		}

		const [repoName] =
			htmlUrl
				.replace('https://github.com/', '')
				.match(/[a-z0-9_.-]+\/[a-z0-9_.-]+/i) || [];

		if (!repoName) {
			throw new Error(
				'Could not parse repository name from github reference URL',
			);
		}
		return repoName;
	}
	return /financial-times\//i.test(repository)
		? repository
		: `Financial-Times/${repository}`;
};

module.exports = { parseRepositoryName };
