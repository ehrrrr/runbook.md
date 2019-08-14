const addLineNumbers = require('add-line-numbers');

function stripLineNumbers(target) {
	if (target.dataset.originalContent) {
		target.value = target.dataset.originalContent;
		delete target.dataset.originalContent;
		target.readOnly = false;
	}
}

function showLineNumbers(target) {
	if (target.value && target.value.length) {
		// already has line numbers
		if (/^\s*1:/.test(target.value)) {
			return stripLineNumbers(target);
		}
		target.dataset.originalContent = target.value;
		target.value = addLineNumbers(target.value);
		target.readOnly = true;
	}
}
async function submitForm(event, form) {
	event.preventDefault();
	const content = form.querySelector('#content');
	if (!content.value.length) {
		content.value = content.placeholder;
	}
	stripLineNumbers(content);
	// TODO: client-side only
	form.submit();
}

module.exports = function(form) {
	// toggle visibility of optional Biz-Ops write fields
	const submitButton = form.querySelector('#submitRunbookForm');
	const runbookContent = form.querySelector('#content');
	const choiceForm = form.querySelector('#import-or-manual');

	if (choiceForm) {
		const cleanup = () => {
			form.querySelector('#runbookContent').removeAttribute('hidden');
			choiceForm.parentNode.removeChild(choiceForm);
		};
		const enterManuallyButton = choiceForm.querySelector('#enter-manually');
		enterManuallyButton.addEventListener('click', ev => {
			ev.preventDefault();
			ev.stopPropagation();
			cleanup();
		});

		const importButton = choiceForm.querySelector('#import-from-biz-ops');

		importButton.addEventListener('click', async ev => {
			ev.preventDefault();
			ev.stopPropagation();
			const systemCode = form.querySelector('#import-system-code').value;
			if (!systemCode) {
				window.alert('Please enter a system code');
				return;
			}

			const runbook = await fetch(
				`/runbook.md/export?systemCode=${systemCode}`,
			).then(res => res.text());

			runbookContent.textContent = runbook;

			cleanup();
		});
	}

	// import-from-biz-ops
	submitButton.addEventListener('click', event => {
		submitForm(event, form);
	});

	runbookContent.addEventListener('focus', ({ target }) =>
		stripLineNumbers(target),
	);
	runbookContent.addEventListener('blur', ({ target }) =>
		showLineNumbers(target),
	);
};
