const { RunbookMdApp } = require('./runbook-md-app');
const schema = require('../../lib/get-configured-schema');
// 1. Listen to check_suite.requested & check_run.rerequested events
// 2. Ingest *RUNBOOK.MD files from tree
// 3. Store results
// 4. Create a check run
// 5. Post commit status
exports.command = async context => {
	await schema.refresh();
	const config = await context.config('runbooks.yml', {});
	const app = new RunbookMdApp(context, config.runbooks);
	await app.gatherRunbooks(context);
	await app.storeResults();
	await app.createCheck(context);
};

// respond to github webhooks
// uses probot's application class
// https://probot.context.github.io/docs/
exports.webhookListener = bot => {
	bot.on('check_suite.requested', context => exports.command(context));
	bot.on('check_run.rerequested', context => exports.command(context));
};
