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
	// toggle visibility of optional Biz Ops write fields
	const submitButton = form.querySelector('#submitRunbookForm');
	const runbookContent = form.querySelector('#content');
	const choiceForm = form.querySelector('#import-or-manual');

	const disableSubmitButton = () =>
		choiceForm ? null : submitButton.setAttribute('disabled', true);
	const enableSubmitButton = () => submitButton.removeAttribute('disabled');

	if (choiceForm) {
		const cleanup = (remove = true) => {
			form.querySelector('#runbookContent').removeAttribute('hidden');
			if (remove) {
				enableSubmitButton();
				choiceForm.parentNode.removeChild(choiceForm);
			} else {
				disableSubmitButton();
			}
		};

		const enterManuallyButton = choiceForm.querySelector('#enter-manually');
		enterManuallyButton.addEventListener('click', ev => {
			ev.preventDefault();
			ev.stopPropagation();
			cleanup();
		});

		const importButton = choiceForm.querySelector('#import-from-biz-ops');

		const populate = async () => {
			disableSubmitButton();
			const systemCode = form.querySelector('#import-system-code').value;
			if (!systemCode) {
				// eslint-disable-next-line no-alert
				window.alert('Please enter a system code');
				return;
			}

			let removeForm = false;
			const runbook = await fetch(
				`/runbook.md/export?systemCode=${systemCode}`,
			).then(res => {
				if (res.ok) {
					removeForm = true;
				}
				return res.text();
			});

			runbookContent.textContent = runbook;

			cleanup(removeForm);
		};

		choiceForm.addEventListener('keyup', ev => {
			if (ev.key === 'Enter') {
				ev.preventDefault();
				ev.stopPropagation();
				populate();
				return false;
			}
		});
		importButton.addEventListener('click', ev => {
			ev.preventDefault();
			ev.stopPropagation();
			populate();
		});
	}

	const avoidPrematureSubmission = ev => {
		if (form.querySelector('#import-or-manual')) {
			ev.stopImmediatePropagation();
			ev.preventDefault();
			return true;
		}
	};

	form.addEventListener('submit', ev => {
		if (avoidPrematureSubmission(ev)) {
			return false;
		}
	});
	// import-from-biz-ops
	submitButton.addEventListener('click', ev => {
		if (avoidPrematureSubmission(ev)) {
			return false;
		}
		submitForm(ev, form);
	});

	runbookContent.addEventListener('focus', ({ target }) =>
		stripLineNumbers(target),
	);
	runbookContent.addEventListener('blur', ({ target }) =>
		showLineNumbers(target),
	);
};
