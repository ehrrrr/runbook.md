const { readFileSync } = require('fs');
const { join } = require('path');

const checkSuiteRequested = require('./webhook/events/check-suite-requested.json');
const checkRunRerequested = require('./webhook/events/check-run-rerequested.json');

exports.runbook = readFileSync(join(__dirname, './runbook-fixture.md'), 'utf8');

exports.sos = require('./sos.json');

exports.badRunbook = readFileSync(join(__dirname, './runbook-fixture.md'));

exports.webhook = { checkSuiteRequested, checkRunRerequested };
