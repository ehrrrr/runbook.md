const addLineNumbers = require('add-line-numbers');

function toggleBizOpsWriteMode(target, toggleFields) {
	const display = target.value === 'yes' ? 'flex' : 'none';
	toggleFields.forEach(field => {
		if (field) {
			field.style.display = display;
		}
	});
}

// TODO: the Origami way!
function toggleErrorState(
	target,
	isValid,
	errorSelector = '.o-forms-input__error',
) {
	const container = target.parentElement;
	const action = isValid ? 'remove' : 'add';
	container.classList[action]('o-forms-input--invalid');
	const errorMessage = container.querySelector(errorSelector);
	errorMessage.style.display = isValid ? 'none' : 'flex';
}

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
async function submitForm(form) {
	const content = form.querySelector('#content');
	if (!content.value.length) {
		content.value = content.placeholder;
	}
	stripLineNumbers(content);
	// TODO: client-side only
	form.submit();
}

function validateSubmission(event, container) {
	event.preventDefault();
	const writeToBizOps = container.querySelector('#writeToBizOps-yes').checked;
	if (!writeToBizOps) {
		return submitForm(container);
	}
	const systemCode = container.querySelector('#systemCode');
	let valid = true;

	if (systemCode.value.length < 3) {
		toggleErrorState(systemCode, false);
		valid = false;
	} else {
		toggleErrorState(systemCode, true);
	}
	const apiKey = container.querySelector('#bizOpsApiKey');
	if (apiKey.value.length < 3) {
		toggleErrorState(apiKey, false);
		valid = false;
	} else {
		toggleErrorState(apiKey, true);
	}
	if (!valid) {
		toggleErrorState(event.target, false, '.runbook-form__submit--error');
		return;
	}
	toggleErrorState(event.target, true, '.runbook-form__submit--error');
	submitForm(container);
}

module.exports = function(form) {
	// toggle visibility of optional Biz-Ops write fields
	const bizOpsToggle = [...form.querySelectorAll('[name="writeToBizOps"]')];
	const toggleFields = [
		form.querySelector('.validation-bizOpsApiKey'),
		form.querySelector('.validation-systemCode'),
	];
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

	bizOpsToggle.forEach(toggle => {
		toggle.addEventListener('change', ({ target }) => {
			toggleBizOpsWriteMode(target, toggleFields);
		});
		if (toggle.checked) {
			toggleBizOpsWriteMode(toggle, toggleFields);
		}
	});

	submitButton.addEventListener('click', event => {
		validateSubmission(event, form);
	});

	runbookContent.addEventListener('focus', ({ target }) =>
		stripLineNumbers(target),
	);
	runbookContent.addEventListener('blur', ({ target }) =>
		showLineNumbers(target),
	);
};
