const { h } = require('hyperons');

const Header = () => {
	return (
		<div className="o-layout__header">
			<div
				className="o-message o-message--notice o-message--warning-light"
				data-o-component="o-message"
				data-close="false"
			>
				<div className="o-message__container">
					<div className="o-message__content">
						<p className="o-message__content-main">
							<span className="o-message__content-highlight">
								This project is currently in BETA
							</span>
							, please provide feedback, or volunteer to take part
							in UX testing, in the{' '}
							<a
								href="https://financialtimes.slack.com/messages/CEJ2Z6EPJ"
								target="_blank"
								rel="noopener noreferrer"
							>
								#ops-and-rel slack channel
							</a>
							.
						</p>
					</div>
				</div>
			</div>
			<header
				className="o-header-services"
				data-o-component="o-header-services"
			>
				<div className="o-header-services__top">
					<div className="o-header-services__logo" />
					<div className="o-header-services__title">
						<a
							className="o-header-services__product-name"
							href="/runbook.md"
						>
							RUNBOOK.md
						</a>{' '}
						<small>
							powered by{' '}
							<a href="https://biz-ops.in.ft.com">Biz Ops</a>
						</small>
						{/* TODO: get Origami to guard for the existence of this bc client-side error */}
						<span className="o-header-services__primary-nav" />
					</div>
				</div>
				<nav
					className="o-header-services__primary-nav"
					aria-label="primary"
				>
					<ul className="o-header-services__primary-nav-list">
						<li>
							<a href="/runbook.md">RUNBOOK.md Generator</a>
						</li>
						<li>
							<a href="/runbook.md/docs/quickstart">Quickstart</a>
						</li>
					</ul>
				</nav>
			</header>
		</div>
	);
};
module.exports = { Header };
