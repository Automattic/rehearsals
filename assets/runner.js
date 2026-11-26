( function () {
	const data = window.rehearsalData;
	const root = document.getElementById( 'rh-app' );
	if ( ! data || ! root ) {
		return;
	}
	const apiFetch = window.wp.apiFetch;
	const { __, _n, sprintf } = window.wp.i18n;
	const DEFAULT_TIMEOUT = 10000;
	const STEP_PAUSE = 150;
	const IMPLICIT_ROLES = {
		button: 'button, input[type=submit], input[type=button]',
		link: 'a[href]',
		table: 'table',
		heading: 'h1, h2, h3, h4, h5, h6',
		textbox: 'input:not([type]), input[type=text], input[type=email], input[type=url], textarea',
		checkbox: 'input[type=checkbox]',
	};

	const state = {
		running: false,
		recipes: data.recipes.map( ( r ) => ( { ...r, checked: ! blocked( r ), open: false, live: null } ) ),
		runs: data.runs.runs,
		runTotal: data.runs.total,
		runPage: 1,
		runPages: data.runs.pages,
		runUsers: data.runUsers,
		filters: { search: '', recipe: '', status: '', user: '' },
	};

	const sleep = ( ms ) => new Promise( ( r ) => setTimeout( r, ms ) );
	const norm = ( s ) => String( s ).replace( /\s+/g, ' ' ).trim();
	const esc = ( s ) =>
		String( s ?? '' ).replace( /[&<>"']/g, ( c ) => ( { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } )[ c ] );
	const short = ( hash ) => String( hash || '' ).slice( 0, 7 );

	root.innerHTML = `
		<div class="rh-progress" id="rh-progress" role="status" hidden>
			<div class="rh-progress-text"><span id="rh-progress-text"></span><button type="button" class="button-link" id="rh-progress-close" hidden aria-label="${ esc( __( 'Hide progress', 'rehearsals' ) ) }">×</button></div>
			<div class="rh-progress-track" aria-hidden="true"><span id="rh-progress-fill"></span></div>
		</div>
		<div class="rh-toolbar">
			<div class="rh-toolbar-group">
				<button type="button" class="button button-primary" id="rh-run">${ esc( __( 'Run selected', 'rehearsals' ) ) }</button>
				<button type="button" class="button" id="rh-run-failed">${ esc( __( 'Run failed', 'rehearsals' ) ) }</button>
				<span class="rh-estimate" id="rh-estimate"></span>
			</div>
			<div class="rh-toolbar-group">
				<button type="button" class="button rh-quiet" id="rh-playwright" title="${ esc( __( 'Export the selected rehearsals as one Playwright test file', 'rehearsals' ) ) }">${ esc( __( 'Run in Playwright', 'rehearsals' ) ) }</button>
				<button type="button" class="button rh-quiet" id="rh-install">${ esc( __( 'Install from link', 'rehearsals' ) ) }</button>
				<button type="button" class="button" id="rh-add">${ esc( __( 'Add rehearsal', 'rehearsals' ) ) }</button>
			</div>
		</div>
		<p class="rh-autorun" id="rh-autorun" role="status" hidden></p>
		<div class="rh-layout">
			<div class="rh-main" id="rh-recipes"></div>
			<aside class="rh-frame" aria-label="${ esc( __( 'Test frame', 'rehearsals' ) ) }">
				<div class="rh-frame-tools">
					<span class="rh-segmented" role="group" aria-label="${ esc( __( 'Viewport', 'rehearsals' ) ) }">
						<button type="button" class="button button-small" data-viewport="desktop" title="${ esc( __( 'Run at desktop width, scaled to fit', 'rehearsals' ) ) }">${ esc( __( 'Desktop', 'rehearsals' ) ) }</button>
						<button type="button" class="button button-small" data-viewport="mobile" title="${ esc( __( 'Run at phone width (390 × 844), so pages use their mobile layout', 'rehearsals' ) ) }">${ esc( __( 'Mobile', 'rehearsals' ) ) }</button>
					</span>
					<span class="rh-muted" id="rh-viewport-note"></span>
				</div>
				<div class="rh-frame-bar"><span id="rh-frame-url">${ esc( __( 'Waiting for a run', 'rehearsals' ) ) }</span><span id="rh-frame-step"></span></div>
				<div class="rh-frame-viewport" id="rh-frame-viewport">
					<iframe name="rehearsal" id="rh-frame" title="${ esc( __( 'Test frame the runner drives', 'rehearsals' ) ) }" src="about:blank"></iframe>
					<p class="rh-frame-idle" id="rh-frame-idle">${ esc( __( "Each step's page loads here when you press Run.", 'rehearsals' ) ) }</p>
				</div>
			</aside>
		</div>
		<h2 id="rh-runs-heading">${ esc( __( 'Recent runs', 'rehearsals' ) ) }</h2>
		<div class="rh-run-filters">
			<input type="search" id="rh-f-search" placeholder="${ esc( __( 'Search by rehearsal or run #', 'rehearsals' ) ) }" aria-label="${ esc( __( 'Search runs', 'rehearsals' ) ) }">
			<select id="rh-f-recipe" aria-label="${ esc( __( 'Recipe', 'rehearsals' ) ) }"></select>
			<select id="rh-f-status" aria-label="${ esc( __( 'Result', 'rehearsals' ) ) }">
				<option value="">${ esc( __( 'Any result', 'rehearsals' ) ) }</option><option value="fail">${ esc( __( 'Failed', 'rehearsals' ) ) }</option><option value="pass">${ esc( __( 'Passed', 'rehearsals' ) ) }</option><option value="queued">${ esc( __( 'Needs Playwright', 'rehearsals' ) ) }</option>
			</select>
			<select id="rh-f-user" aria-label="${ esc( __( 'Run by', 'rehearsals' ) ) }"></select>
			<button type="button" class="button-link" id="rh-f-clear" hidden>${ esc( __( 'Clear filters', 'rehearsals' ) ) }</button>
			<span class="rh-muted" id="rh-f-count"></span>
		</div>
		<div id="rh-history"></div>
		<p><button type="button" class="button" id="rh-more" hidden>${ esc( __( 'Load more runs', 'rehearsals' ) ) }</button></p>
		<dialog class="rh-modal" id="rh-modal" aria-labelledby="rh-modal-title"></dialog>`;

	const frame = document.getElementById( 'rh-frame' );
	const viewport = document.getElementById( 'rh-frame-viewport' );
	const runButton = document.getElementById( 'rh-run' );
	const runFailedButton = document.getElementById( 'rh-run-failed' );

	// Desktop pages render at least 1280 px wide and are scaled to fit, so a narrow column doesn't trigger
	// mobile layouts. Mobile renders at a phone's size, so pages use their mobile layout (CSS only: the
	// browser's user agent stays the same, so wp_is_mobile() still says desktop).
	const VIEWPORTS = {
		desktop: { width: 1280, height: 800, fill: true },
		mobile: { width: 390, height: 844, fill: false },
	};
	// Per-browser conveniences; the page works without them.
	const remember = ( key, value ) => {
		try {
			if ( value === undefined ) return window.localStorage.getItem( 'rehearsal-' + key );
			window.localStorage.setItem( 'rehearsal-' + key, value );
		} catch ( e ) {}
		return null;
	};
	state.viewport = remember( 'viewport' ) === 'mobile' ? 'mobile' : 'desktop';
	// The size in use: a running rehearsal's own "viewport" setting wins over the switch.
	const currentViewport = () => state.runViewport || state.viewport;
	const fitFrame = () => {
		const size = VIEWPORTS[ currentViewport() ];
		const width = size.fill ? Math.max( size.width, viewport.clientWidth ) : size.width;
		const scale = Math.min( 1, viewport.clientWidth / width );
		frame.style.width = width + 'px';
		frame.style.height = size.height + 'px';
		frame.style.transform = `scale(${ scale })`;
		frame.style.marginInlineStart = Math.max( 0, ( viewport.clientWidth - width * scale ) / 2 ) + 'px';
		viewport.style.height = size.height * scale + 'px';
		viewport.classList.toggle( 'is-mobile', ! size.fill );
	};
	new ResizeObserver( fitFrame ).observe( viewport );
	fitFrame();

	// Undo anything a previous page did to the frame's position, so every rehearsal starts from the same view.
	function resetFrame() {
		viewport.removeAttribute( 'style' );
		frame.removeAttribute( 'style' );
		viewport.scrollTo( 0, 0 );
		fitFrame();
	}

	function renderFrameTools() {
		root.querySelectorAll( '[data-viewport]' ).forEach( ( b ) => {
			b.setAttribute( 'aria-pressed', String( b.dataset.viewport === currentViewport() ) );
			// A run keeps the size it started with, so its steps all see the same layout.
			b.disabled = state.running;
		} );
		document.getElementById( 'rh-viewport-note' ).textContent =
			state.runViewport && state.runViewport !== state.viewport
				? /* translators: %s: screen size, desktop or mobile. */ sprintf( __( 'This rehearsal runs on %s only', 'rehearsals' ), state.runViewport )
				: '';
	}

	function setViewport( name ) {
		state.viewport = name;
		remember( 'viewport', name );
		fitFrame();
		renderFrameTools();
	}

	root.querySelector( '.rh-frame-tools' ).addEventListener( 'click', ( e ) => {
		const view = e.target.closest( '[data-viewport]' );
		if ( view && ! view.disabled ) setViewport( view.dataset.viewport );
	} );
	renderFrameTools();
	document.getElementById( 'rh-progress-close' ).addEventListener( 'click', () => {
		state.progress = null;
		renderProgress();
	} );

	// ---------- Rendering ----------

	function statusOf( r ) {
		if ( r.live ) {
			if ( r.live.status === 'running' ) return [ 'running', __( 'Running…', 'rehearsals' ) ];
			if ( r.live.status === 'unsaved' ) return [ 'fail', __( 'Not saved', 'rehearsals' ) ];
		}
		if ( ! r.lastRun ) return [ '', __( 'Not run', 'rehearsals' ) ];
		if ( r.lastRun.hash !== r.hash ) return [ 'stale', __( 'Stale: rehearsal changed', 'rehearsals' ) ];
		return pillFor( r.lastRun.status );
	}

	function failedRecipes() {
		return state.recipes.filter( ( r ) => ! blocked( r ) && statusOf( r )[ 0 ] === 'fail' );
	}

	// A rehearsal whose required plugins are not all active here: shown, but it cannot run.
	function blocked( r ) {
		return !! ( r.missing && r.missing.length );
	}

	// Written for a newer Rehearsal than this one: it can run, but some steps may not work.
	function newerText( format ) {
		return sprintf(
			/* translators: 1: the rehearsal's format number, 2: the newest format this site understands. */
			__( 'Made with a newer version of Rehearsal (format %1$s; this site understands format %2$s). Some steps may not work; update the Rehearsal plugin to be sure.', 'rehearsals' ),
			format,
			data.format
		);
	}

	function newerPill( r ) {
		return r.newer ? ` <span class="rh-pill stale" title="${ esc( newerText( r.format ) ) }">${ esc( __( 'Newer format', 'rehearsals' ) ) }</span>` : '';
	}

	function needsPill( r ) {
		if ( ! blocked( r ) ) return '';
		const why = r.missing
			.map( ( m ) => {
				if ( m.kind === 'role' ) {
					/* translators: %s: role slug, such as editor. */
					return sprintf( __( 'there is no "%s" role on this site', 'rehearsals' ), m.name );
				}
				if ( m.state !== 'inactive' ) {
					/* translators: %s: plugin or theme name. */
					return sprintf( __( '%s is not installed', 'rehearsals' ), m.name );
				}
				return m.kind === 'theme'
					? /* translators: %s: theme name. */ sprintf( __( '%s is installed but not the active theme', 'rehearsals' ), m.name )
					: /* translators: %s: plugin name. */ sprintf( __( '%s is installed but not active', 'rehearsals' ), m.name );
			} )
			.join( '; ' );
		/* translators: %s: comma-separated list of the plugins, themes or roles the rehearsal needs. */
		const needs = sprintf( __( 'Needs %s', 'rehearsals' ), r.missing.map( ( m ) => m.name ).join( ', ' ) );
		return ` <span class="rh-pill fail" title="${ esc( why ) }">${ esc( needs ) }</span>`;
	}

	function pillFor( status ) {
		return (
			{ pass: [ 'pass', __( 'Passed', 'rehearsals' ) ], fail: [ 'fail', __( 'Failed', 'rehearsals' ) ], queued: [ 'queued', __( 'Needs Playwright', 'rehearsals' ) ] }[ status ] || [ '', status ]
		);
	}

	function ago( iso ) {
		const s = Math.round( ( Date.now() - new Date( iso ).getTime() ) / 1000 );
		if ( s < 60 ) return __( 'just now', 'rehearsals' );
		/* translators: %d: number of minutes. */
		if ( s < 3600 ) return sprintf( _n( '%d min ago', '%d min ago', Math.round( s / 60 ), 'rehearsals' ), Math.round( s / 60 ) );
		/* translators: %d: number of hours. */
		if ( s < 86400 ) return sprintf( _n( '%d h ago', '%d h ago', Math.round( s / 3600 ), 'rehearsals' ), Math.round( s / 3600 ) );
		return new Date( iso ).toLocaleDateString();
	}

	// Same message from the same page counts once, with how often it happened.
	function groupErrors( errors ) {
		const groups = new Map();
		errors.forEach( ( e ) => {
			const page = e.page.split( '?' )[ 0 ];
			const key = page + '\n' + e.msg;
			if ( groups.has( key ) ) groups.get( key ).count++;
			else groups.set( key, { msg: e.msg, page, source: e.source || '', count: 1 } );
		} );
		return [ ...groups.values() ];
	}

	function errorsHtml( errors, copyAttr ) {
		if ( ! errors || ! errors.length ) return '';
		const items = errors
			.map(
				( e ) => `<li>
					<div class="rh-err-meta">${ e.count > 1 ? `<b>${ e.count }×</b> ` : '' }${ /* translators: %s: the page the error happened on. */ sprintf( esc( __( 'on %s', 'rehearsals' ) ), `<code>${ esc( e.page ) }</code>` ) }</div>
					<pre class="rh-err-msg">${ esc( e.msg ) }</pre>
					${ e.source ? `<pre class="rh-err-src">${ esc( e.source ) }</pre>` : '' }
				</li>`
			)
			.join( '' );
		return `<div class="rh-errors">
			<div class="rh-errors-head"><strong>${ /* translators: %d: number of distinct console errors. */ esc( sprintf( __( 'Console errors (%d)', 'rehearsals' ), errors.length ) ) }</strong>
			<button type="button" class="button button-small" ${ copyAttr }>${ esc( __( 'Copy errors', 'rehearsals' ) ) }</button></div>
			<ol>${ items }</ol></div>`;
	}

	// A bug report for pasting into an issue, read by people on other sites, so it stays in English like the GitHub block.
	function errorsText( errors, run, title ) {
		const head = [
			`Rehearsal: console errors in "${ title }"`,
			`Site: ${ data.homeUrl }`,
			`Build: ${ run ? run.build : data.build }`,
			run ? `Run: #${ run.id } on ${ run.date } by ${ run.by }, rehearsal ${ short( run.hash ) }` : 'Run: not saved',
			'',
		];
		const body = errors.map( ( e, i ) =>
			[ `${ i + 1 }. ${ e.count > 1 ? `[${ e.count }×] ` : '' }${ e.page }`, indent( e.msg ), e.source ? indent( e.source ) : '' ]
				.filter( Boolean )
				.join( '\n' )
		);
		return head.concat( body.join( '\n\n' ) ).join( '\n' );
	}

	function indent( text ) {
		return text
			.split( '\n' )
			.map( ( l ) => '   ' + l )
			.join( '\n' );
	}

	// Shows a short status on a button, then its own label again, however often it's clicked.
	function flash( button, text, ms = 1500 ) {
		if ( ! button.dataset.label ) button.dataset.label = button.textContent;
		clearTimeout( button.flashTimer );
		button.textContent = text;
		if ( ms ) button.flashTimer = setTimeout( () => ( button.textContent = button.dataset.label ), ms );
	}

	async function copy( text, button ) {
		try {
			await navigator.clipboard.writeText( text );
		} catch ( e ) {
			// Clipboard API needs a secure context and focus; fall back to a selected textarea.
			const ta = document.createElement( 'textarea' );
			ta.value = text;
			document.body.appendChild( ta );
			ta.select();
			document.execCommand( 'copy' );
			ta.remove();
		}
		flash( button, __( 'Copied', 'rehearsals' ) );
	}

	// The clipboard gets a pending promise right away: Chrome refuses a write that waits on a request first.
	async function copyFetched( url, button ) {
		flash( button, __( 'Copying…', 'rehearsals' ), 0 );
		const text = fetch( url, { credentials: 'same-origin' } ).then( ( res ) => {
			if ( ! res.ok ) throw new Error( `HTTP ${ res.status }` );
			return res.text();
		} );
		try {
			if ( window.ClipboardItem ) {
				await navigator.clipboard.write( [ new ClipboardItem( { 'text/plain': text.then( ( t ) => new Blob( [ t ], { type: 'text/plain' } ) ) } ) ] );
			} else {
				await navigator.clipboard.writeText( await text );
			}
			flash( button, __( 'Copied', 'rehearsals' ) );
		} catch ( e ) {
			flash( button, __( 'Copy failed', 'rehearsals' ) );
		}
	}

	function logHtml( log, cleared ) {
		if ( ! log || ! log.length ) {
			return `<p class="rh-muted">${ esc( cleared ? __( 'Not part of the latest run. Its last log is under Recent runs.', 'rehearsals' ) : __( 'No steps run yet.', 'rehearsals' ) ) }</p>`;
		}
		return `<ol class="rh-log">${ log
			.map(
				( l ) =>
					`<li class="${ l.ok ? 'ok' : 'no' }"><span aria-hidden="true">${ l.ok ? '✓' : '✗' }</span><span class="msg">${ esc(
						l.msg
					) }${ ( l.pages || [] ).map( metricsHtml ).join( '' ) }</span><span class="ms">${ l.ms ? /* translators: %d: duration in milliseconds. */ esc( sprintf( __( '%d ms', 'rehearsals' ), l.ms ) ) : '' }</span></li>`
			)
			.join( '' ) }</ol>`;
	}

	const ms = ( v ) =>
		v < 1000
			? /* translators: %s: duration in milliseconds. */ sprintf( __( '%s ms', 'rehearsals' ), v )
			: /* translators: %s: duration in seconds, such as 1.5. */ sprintf( __( '%s s', 'rehearsals' ), ( v / 1000 ).toFixed( 1 ) );
	const mb = ( v ) =>
		v < 1048576
			? /* translators: %s: size in kilobytes. */ sprintf( __( '%s KB', 'rehearsals' ), Math.round( v / 1024 ) )
			: /* translators: %s: size in megabytes, such as 1.5. */ sprintf( __( '%s MB', 'rehearsals' ), ( v / 1048576 ).toFixed( 1 ) );
	const FORMAT = { ttfb: ms, fcp: ms, lcp: ms, cls: ( v ) => v.toFixed( 2 ), requests: String, weight: mb, js: mb };

	// One line per page load, with anything over budget called out.
	function metricsHtml( p ) {
		const warn = p.warn || [];
		const item = ( k, text ) => {
			if ( p[ k ] === null || p[ k ] === undefined ) return '';
			const over = warn.includes( k ) ? ` <small>${ /* translators: %s: the budget limit, such as 2.5 s. */ esc( sprintf( __( '(budget %s)', 'rehearsals' ), FORMAT[ k ]( p.limits[ k ] ) ) ) }</small>` : '';
			return `<span class="rh-metric ${ over ? 'warn' : '' }">${ esc( text ) }${ over }</span>`;
		};
		const items = [
			item( 'ttfb', `TTFB ${ ms( p.ttfb ) }` ),
			item( 'fcp', `FCP ${ ms( p.fcp ) }` ),
			item( 'lcp', `LCP ${ ms( p.lcp ) }` ),
			item( 'cls', `CLS ${ p.cls.toFixed( 2 ) }` ),
			/* translators: %d: number of requests. */
			item( 'requests', sprintf( _n( '%d request', '%d requests', p.requests, 'rehearsals' ), p.requests ) ),
			item( 'weight', `${ mb( p.weight ) }` ),
			item( 'js', `JS ${ mb( p.js ) }` ),
		].filter( Boolean );
		/* translators: %s: size, such as 1.2 MB. */
		const extra = [ sprintf( __( '%s downloaded', 'rehearsals' ), mb( p.downloaded ) ) ];
		/* translators: %d: number of files from other sites. */
		if ( p.unmeasured ) extra.push( sprintf( _n( '%d other-site file not sized', '%d other-site files not sized', p.unmeasured, 'rehearsals' ), p.unmeasured ) );
		return `<span class="rh-metrics ${ warn.length ? 'warn' : '' }">
			<span class="rh-metrics-url">${ esc( p.url.split( '?' )[ 0 ] ) }${ warn.length ? ` · <b>${ esc( __( 'Over budget', 'rehearsals' ) ) }</b>` : '' }</span>
			${ items.join( '<span aria-hidden="true"> · </span>' ) }<span class="rh-muted"> · ${ esc( extra.join( ' · ' ) ) }</span></span>`;
	}

	// How many page loads in a run went over the rehearsal's budget.
	function slowPages( run ) {
		return ( ( run && run.log ) || [] ).flatMap( ( l ) => l.pages || [] ).filter( ( p ) => ( p.warn || [] ).length ).length;
	}

	function slowPill( run ) {
		const n = slowPages( run );
		return n
			? ` <span class="rh-pill stale" title="${ esc( __( "Page loads over this rehearsal's budget", 'rehearsals' ) ) }">${ /* translators: %d: number of page loads over budget. */ esc( sprintf( __( '%d over budget', 'rehearsals' ), n ) ) }</span>`
			: '';
	}

	// ---------- Estimates and progress ----------

	// Time to save a run after its last step.
	const SAVE_MS = 500;

	const duration = ( ms ) => {
		const s = Math.max( 0, Math.round( ms / 1000 ) );
		if ( s < 60 ) {
			/* translators: %d: number of seconds. */
			return sprintf( __( '%d s', 'rehearsals' ), s );
		}
		return s % 60
			? /* translators: 1: number of minutes, 2: number of seconds. */ sprintf( __( '%1$d min %2$d s', 'rehearsals' ), Math.floor( s / 60 ), s % 60 )
			: /* translators: %d: number of minutes. */ sprintf( __( '%d min', 'rehearsals' ), Math.floor( s / 60 ) );
	};

	// Average time per step in a run's log, leaving out the 0 ms notes ({{run}}, role, warnings) and failed
	// steps, which mostly wait out a timeout.
	function stepMs( log ) {
		const timed = ( log || [] ).filter( ( l ) => l.ok && l.ms > 0 );
		return timed.length ? timed.reduce( ( t, l ) => t + l.ms, 0 ) / timed.length : null;
	}

	// The same across every rehearsal's last run, for rehearsals that have never run.
	function typicalStepMs() {
		const all = state.recipes.flatMap( ( r ) => ( r.lastRun && r.lastRun.log ) || [] );
		return stepMs( all ) || 1500;
	}

	// How long a rehearsal should take, from its last run: the whole run when it passed, or its pace per
	// step when it stopped early. One that has never run is guessed from the others.
	function estimate( r ) {
		const steps = r.recipe.needs === 'playwright' ? 0 : r.recipe.steps.length;
		const log = r.lastRun && r.lastRun.log;
		if ( log && log.length && r.lastRun.status === 'pass' ) {
			return { ms: log.reduce( ( t, l ) => t + ( l.ms || 0 ), 0 ) + steps * STEP_PAUSE + SAVE_MS, guessed: false };
		}
		const pace = stepMs( log );
		return { ms: steps * ( ( pace || typicalStepMs() ) + STEP_PAUSE ) + SAVE_MS, guessed: ! pace };
	}

	function totalEstimate( recipes ) {
		const all = recipes.map( estimate );
		return { ms: all.reduce( ( t, e ) => t + e.ms, 0 ), guessed: all.some( ( e ) => e.guessed ) };
	}

	let progressTimer = null;

	function startProgress( picked ) {
		state.progress = { picked, est: picked.map( estimate ), index: 0, step: 0, started: performance.now(), current: performance.now(), done: false };
		clearInterval( progressTimer );
		progressTimer = setInterval( renderProgress, 500 );
		renderProgress();
	}

	function progressAt( index ) {
		Object.assign( state.progress, { index, step: 0, current: performance.now() } );
		renderProgress();
	}

	function progressStep( step ) {
		if ( state.progress ) state.progress.step = step;
		renderProgress();
	}

	function finishProgress() {
		clearInterval( progressTimer );
		if ( state.progress ) state.progress.done = true;
		renderProgress();
	}

	function renderProgress() {
		const p = state.progress;
		const box = document.getElementById( 'rh-progress' );
		if ( ! p ) {
			box.hidden = true;
			root.style.removeProperty( '--rh-progress-height' );
			return;
		}
		const n = p.picked.length;
		const now = performance.now();
		const elapsed = now - p.started;
		const total = p.est.reduce( ( t, e ) => t + e.ms, 0 );
		const guessed = p.est.some( ( e ) => e.guessed );
		let fraction;
		let text;
		let tone = 'running';
		if ( p.done ) {
			const results = p.picked.map( ( r ) => ( r.live ? 'unsaved' : r.lastRun && r.lastRun.status ) );
			const count = ( status ) => results.filter( ( x ) => x === status ).length;
			const tally = [
				/* translators: %d: number of rehearsals that passed. */
				count( 'pass' ) ? sprintf( _n( '%d passed', '%d passed', count( 'pass' ), 'rehearsals' ), count( 'pass' ) ) : '',
				/* translators: %d: number of rehearsals that failed. */
				count( 'fail' ) ? sprintf( _n( '%d failed', '%d failed', count( 'fail' ), 'rehearsals' ), count( 'fail' ) ) : '',
				/* translators: %d: number of rehearsals waiting for the Playwright runner. */
				count( 'queued' ) ? sprintf( _n( '%d needs Playwright', '%d need Playwright', count( 'queued' ), 'rehearsals' ), count( 'queued' ) ) : '',
				/* translators: %d: number of runs that could not be saved. */
				count( 'unsaved' ) ? sprintf( _n( '%d not saved', '%d not saved', count( 'unsaved' ), 'rehearsals' ), count( 'unsaved' ) ) : '',
			].filter( Boolean );
			tone = results.some( ( x ) => x === 'fail' || x === 'unsaved' ) ? 'fail' : 'pass';
			fraction = 1;
			const ran = guessed
				? /* translators: 1: number of rehearsals, 2: how long they took, 3: how long they were expected to take. */
				  _n( 'Ran %1$d rehearsal in %2$s (expected about %3$s, partly guessed)', 'Ran %1$d rehearsals in %2$s (expected about %3$s, partly guessed)', n, 'rehearsals' )
				: /* translators: 1: number of rehearsals, 2: how long they took, 3: how long they were expected to take. */
				  _n( 'Ran %1$d rehearsal in %2$s (expected about %3$s)', 'Ran %1$d rehearsals in %2$s (expected about %3$s)', n, 'rehearsals' );
			text = [ sprintf( ran, n, duration( elapsed ), duration( total ) ), ...tally ].join( ' · ' );
		} else {
			const r = p.picked[ p.index ];
			const steps = r.recipe.needs === 'playwright' ? 0 : r.recipe.steps.length;
			const inCurrent = now - p.current;
			const later = p.est.slice( p.index + 1 ).reduce( ( t, e ) => t + e.ms, 0 );
			const over = inCurrent > p.est[ p.index ].ms;
			const left = Math.max( 0, p.est[ p.index ].ms - inCurrent ) + later;
			fraction = ( p.index + ( steps ? p.step / steps : 0 ) ) / n;
			let pace;
			if ( over ) {
				pace = later
					? /* translators: %s: time left for the rehearsals after this one. */ sprintf( __( 'taking longer than last time; about %s for the rest', 'rehearsals' ), duration( later ) )
					: __( 'taking longer than last time', 'rehearsals' );
			} else {
				pace = guessed
					? /* translators: %s: time left. */ sprintf( __( 'about %s left (partly guessed: some have never run)', 'rehearsals' ), duration( left ) )
					: /* translators: %s: time left. */ sprintf( __( 'about %s left', 'rehearsals' ), duration( left ) );
			}
			text = [
				/* translators: 1: number of the rehearsal running, 2: how many rehearsals are running, 3: rehearsal title. */
				sprintf( __( 'Running %1$d of %2$d: %3$s', 'rehearsals' ), p.index + 1, n, r.title ),
				/* translators: 1: number of the step running, 2: how many steps the rehearsal has. */
				steps ? sprintf( __( 'step %1$d of %2$d', 'rehearsals' ), Math.max( 1, p.step ), steps ) : '',
				/* translators: %s: time since the run started. */
				sprintf( __( '%s so far', 'rehearsals' ), duration( elapsed ) ),
				pace,
			]
				.filter( Boolean )
				.join( ' · ' );
		}
		box.hidden = false;
		box.className = `rh-progress ${ tone }`;
		document.getElementById( 'rh-progress-text' ).textContent = text;
		document.getElementById( 'rh-progress-fill' ).style.inlineSize = `${ Math.round( fraction * 100 ) }%`;
		document.getElementById( 'rh-progress-close' ).hidden = ! p.done;
		// The sticky frame sits below the sticky progress bar.
		root.style.setProperty( '--rh-progress-height', `${ box.offsetHeight + 12 }px` );
	}

	function renderRecipes() {
		const all = state.recipes.filter( ( r ) => ! blocked( r ) ).every( ( r ) => r.checked );
		const rows = state.recipes
			.map( ( r, i ) => {
				const [ cls, label ] = statusOf( r );
				const log = r.live ? r.live.log : ! r.logCleared && r.lastRun && r.lastRun.log;
				const lastRun =
					r.lastRun && r.lastRun.viewport === 'mobile'
						? /* translators: 1: how long ago, such as 5 min ago, 2: user login. */ __( 'last run %1$s by %2$s (mobile)', 'rehearsals' )
						: /* translators: 1: how long ago, such as 5 min ago, 2: user login. */ __( 'last run %1$s by %2$s', 'rehearsals' );
				const meta = [
					/* translators: %s: short rehearsal ID. */
					sprintf( esc( __( 'rehearsal %s', 'rehearsals' ) ), `<code>${ short( r.hash ) }</code>` ),
					/* translators: %d: number of steps. */
					esc( sprintf( _n( '%d step', '%d steps', r.recipe.steps.length, 'rehearsals' ), r.recipe.steps.length ) ),
					r.recipe.covers
						? /* translators: %s: comma-separated list of labels the rehearsal covers. */ sprintf( esc( __( 'covers %s', 'rehearsals' ) ), r.recipe.covers.map( esc ).join( ', ' ) )
						: esc( __( 'manual only', 'rehearsals' ) ),
					/* translators: %s: comma-separated list of required plugin slugs. */
					r.recipe.requires ? sprintf( esc( __( 'requires %s', 'rehearsals' ) ), r.recipe.requires.map( esc ).join( ', ' ) ) : '',
					/* translators: %s: required theme slug, or several joined with "or". */
					r.recipe.theme ? sprintf( esc( __( 'theme %s', 'rehearsals' ) ), esc( [].concat( r.recipe.theme ).join( ' or ' ) ) ) : '',
					/* translators: %s: role slug, such as editor. */
					r.recipe.role ? sprintf( esc( __( 'as %s', 'rehearsals' ) ), esc( r.recipe.role ) ) : '',
					/* translators: %s: screen size, desktop or mobile. */
					r.recipe.viewport ? sprintf( esc( __( '%s only', 'rehearsals' ) ), esc( r.recipe.viewport ) ) : '',
					r.source ? esc( __( 'installed from a link', 'rehearsals' ) ) : '',
					r.lastRun ? sprintf( esc( lastRun ), esc( ago( r.lastRun.date ) ), esc( r.lastRun.by ) ) : '',
					/* translators: %s: expected duration, such as 1 min 5 s. */
					r.lastRun && ! estimate( r ).guessed ? esc( sprintf( __( 'takes about %s', 'rehearsals' ), duration( estimate( r ).ms ) ) ) : '',
				].filter( Boolean );
				const error = r.live && r.live.error ? `<p class="rh-error">${ esc( r.live.error ) }</p>` : '';
				return `
				<tr class="${ blocked( r ) ? 'rh-blocked' : '' }">
					<th scope="row" class="check-column"><input type="checkbox" data-i="${ i }" ${ r.checked && ! blocked( r ) ? 'checked' : '' } ${
						state.running || blocked( r ) ? 'disabled' : ''
					} aria-label="${ /* translators: %s: rehearsal title. */ esc( sprintf( __( 'Include %s', 'rehearsals' ), r.title ) ) }"></th>
					<td>
						<strong><button type="button" class="button-link rh-title" data-open="${ i }">${ esc( r.title ) }</button></strong>
						<div class="rh-meta">${ meta.join( ' · ' ) }</div>
					</td>
					<td><span class="rh-pill ${ cls }">${ esc( label ) }</span>${ r.recipe.budgets ? slowPill( r.live || r.lastRun ) : '' }${ needsPill( r ) }${ newerPill( r ) }</td>
					<td class="rh-row-actions"><button type="button" class="button button-small" data-run-row="${ i }" ${
						state.running || blocked( r ) ? 'disabled' : ''
					} aria-label="${ /* translators: %s: rehearsal title. */ esc( sprintf( __( 'Run %s', 'rehearsals' ), r.title ) ) }">${ esc( __( 'Run', 'rehearsals' ) ) }</button>
					<button type="button" class="button-link" data-toggle="${ i }" aria-expanded="${ r.open }">${
						esc( r.open ? __( 'Hide log', 'rehearsals' ) : __( 'Log', 'rehearsals' ) )
					}</button></td>
				</tr>
				<tr class="rh-detail" ${ r.open ? '' : 'hidden' }><td></td><td colspan="3">${ error }${ logHtml( log, r.logCleared && r.lastRun ) }${ errorsHtml(
					r.live ? r.live.errors : ! r.logCleared && r.lastRun && r.lastRun.errors,
					`data-copy-recipe="${ i }"`
				) }${ r.lastRun ? `<button type="button" class="button-link" data-runs-for="${ r.id }">${ esc( __( 'See all runs of this rehearsal', 'rehearsals' ) ) }</button>` : '' }</td></tr>`;
			} )
			.join( '' );
		document.getElementById( 'rh-recipes' ).innerHTML = `
			<table class="widefat rh-recipes">
				<thead><tr>
					<td class="check-column"><input type="checkbox" data-all ${ all ? 'checked' : '' } ${
						state.running ? 'disabled' : ''
					} aria-label="${ esc( __( 'Select all rehearsals', 'rehearsals' ) ) }"></td>
					<th>${ esc( __( 'Rehearsal', 'rehearsals' ) ) }</th><th>${ esc( __( 'Last result', 'rehearsals' ) ) }</th><th></th>
				</tr></thead>
				<tbody>${ rows || `<tr><td></td><td colspan="3" class="rh-muted">${ esc( __( 'No rehearsals yet. Add one, or install one from a link.', 'rehearsals' ) ) }</td></tr>` }</tbody>
			</table>`;
		renderSummary();
	}

	function renderSummary() {
		const selected = state.recipes.filter( ( r ) => r.checked && ! blocked( r ) );
		runButton.disabled = state.running || ! selected.length;
		const expected = totalEstimate( selected );
		runButton.textContent = state.running
			? __( 'Running…', 'rehearsals' )
			: /* translators: %d: number of selected rehearsals. */ sprintf( _n( 'Run %d selected', 'Run %d selected', selected.length, 'rehearsals' ), selected.length );
		// While running, the progress bar has the time left.
		const estimate = document.getElementById( 'rh-estimate' );
		/* translators: %s: expected duration, such as 1 min 5 s. */
		estimate.textContent = ! state.running && selected.length ? sprintf( __( 'About %s', 'rehearsals' ), duration( expected.ms ) ) : '';
		estimate.title = expected.guessed ? __( 'From the last runs; rehearsals that have never run are guessed.', 'rehearsals' ) : __( 'From the last runs.', 'rehearsals' );
		renderFrameTools();
		const failed = failedRecipes().length;
		runFailedButton.disabled = state.running || ! failed;
		runFailedButton.textContent = failed
			? /* translators: %d: number of failed rehearsals. */ sprintf( _n( 'Run %d failed', 'Run %d failed', failed, 'rehearsals' ), failed )
			: __( 'Run failed', 'rehearsals' );
	}

	const hasFilters = () => Object.values( state.filters ).some( Boolean );

	function renderFilterOptions() {
		const option = ( value, label, current ) => `<option value="${ value }" ${ String( current ) === String( value ) ? 'selected' : '' }>${ esc( label ) }</option>`;
		document.getElementById( 'rh-f-recipe' ).innerHTML =
			option( '', __( 'All recipes', 'rehearsals' ), state.filters.recipe ) + state.recipes.map( ( r ) => option( r.id, r.title, state.filters.recipe ) ).join( '' );
		document.getElementById( 'rh-f-user' ).innerHTML =
			option( '', __( 'Anyone', 'rehearsals' ), state.filters.user ) + state.runUsers.map( ( u ) => option( u.id, u.name, state.filters.user ) ).join( '' );
		document.getElementById( 'rh-f-status' ).value = state.filters.status;
		document.getElementById( 'rh-f-search' ).value = state.filters.search;
		document.getElementById( 'rh-f-clear' ).hidden = ! hasFilters();
	}

	let runsRequest = 0;
	async function loadRuns( append ) {
		const mine = ++runsRequest;
		const page = append ? state.runPage + 1 : 1;
		const query = new URLSearchParams( { page } );
		Object.entries( state.filters ).forEach( ( [ k, v ] ) => v && query.set( k, v ) );
		try {
			const res = await apiFetch( { path: `/rehearsal/v1/runs/search?${ query }` } );
			if ( mine !== runsRequest ) return; // A newer filter change already replaced this one.
			// A run saved since the last page shifts the server's pages, so the next page can repeat a row.
			const seen = new Set( state.runs.map( ( run ) => run.id ) );
			state.runs = append ? state.runs.concat( res.runs.filter( ( run ) => ! seen.has( run.id ) ) ) : res.runs;
			state.runTotal = res.total;
			state.runPages = res.pages;
			state.runPage = page;
		} catch ( e ) {
			state.runsError = e.message || __( 'Could not load runs.', 'rehearsals' );
		}
		renderFilterOptions();
		renderHistory();
	}

	function filterRuns( changes ) {
		Object.assign( state.filters, changes );
		return loadRuns( false );
	}

	function renderHistory() {
		const el = document.getElementById( 'rh-history' );
		document.getElementById( 'rh-f-count' ).textContent = sprintf(
			hasFilters()
				? /* translators: %d: number of runs that match the filters. */ _n( '%d run match', '%d runs match', state.runTotal, 'rehearsals' )
				: /* translators: %d: number of runs. */ _n( '%d run', '%d runs', state.runTotal, 'rehearsals' ),
			state.runTotal
		);
		document.getElementById( 'rh-more' ).hidden = state.runPage >= state.runPages;
		if ( state.runsError ) {
			el.innerHTML = `<p class="rh-error">${ esc( state.runsError ) }</p>`;
			state.runsError = '';
			return;
		}
		if ( ! state.runs.length ) {
			el.innerHTML = `<p class="rh-muted">${ esc( hasFilters() ? __( 'No runs match these filters.', 'rehearsals' ) : __( 'Runs appear here once they are saved.', 'rehearsals' ) ) }</p>`;
			return;
		}
		el.innerHTML = `
			<table class="widefat striped rh-history">
				<thead><tr><th>${ esc( __( 'When', 'rehearsals' ) ) }</th><th>${ esc( __( 'Rehearsal', 'rehearsals' ) ) }</th><th>${ esc( __( 'Result', 'rehearsals' ) ) }</th><th>${ esc( __( 'Rehearsal ID', 'rehearsals' ) ) }</th><th>${ esc( __( 'Build', 'rehearsals' ) ) }</th><th>${ esc( __( 'By', 'rehearsals' ) ) }</th></tr></thead>
				<tbody>${ state.runs
					.map( ( run ) => {
						const [ cls, label ] = pillFor( run.status );
						const current = state.recipes.find( ( r ) => r.id === run.recipeId );
						const stale = current && current.hash !== run.hash ? ` <span class="rh-pill stale">${ esc( __( 'older version', 'rehearsals' ) ) }</span>` : '';
						return `<tr>
							<td title="${ esc( run.date ) }">${ esc( ago( run.date ) ) }</td>
							<td><details><summary>${ esc( run.title ) } <span class="rh-muted">#${ run.id }</span></summary>${ logHtml(
								run.log
							) }${ errorsHtml( run.errors, `data-copy-run="${ run.id }"` ) }${ run.snapshots ? `<p class="rh-muted">${ /* translators: %d: number of HTML snapshots. */ esc( sprintf( _n( '%d HTML snapshot stored with this run.', '%d HTML snapshots stored with this run.', run.snapshots, 'rehearsals' ), run.snapshots ) ) }</p>` : '' }</details></td>
							<td><span class="rh-pill ${ cls }">${ esc( label ) }</span>${ slowPill( run ) }${ run.runner === 'playwright' ? ` <span class="rh-muted">${ esc( __( 'in Playwright', 'rehearsals' ) ) }</span>` : '' }${ run.viewport === 'mobile' ? ` <span class="rh-muted">${ esc( __( 'mobile', 'rehearsals' ) ) }</span>` : '' }</td>
							<td><code>${ short( run.hash ) }</code>${ stale }</td>
							<td>${ esc( run.build ) }</td>
							<td><button type="button" class="button-link" data-filter-user="${ run.byId }" title="${ /* translators: %s: user login. */ esc( sprintf( __( 'Show only runs by %s', 'rehearsals' ), run.by ) ) }">${ esc( run.by ) }</button>${ run.role ? ` <span class="rh-muted">${ /* translators: %s: role slug, such as editor. */ esc( sprintf( __( 'as %s', 'rehearsals' ), run.role ) ) }</span>` : '' }${ run.ref ? ` <span class="rh-muted">${ /* translators: %s: the label the run was started with. */ esc( sprintf( __( 'ref %s', 'rehearsals' ), run.ref ) ) }</span>` : '' }</td>
						</tr>`;
					} )
					.join( '' ) }</tbody>
			</table>`;
	}

	root.addEventListener( 'change', ( e ) => {
		const t = e.target;
		if ( t.matches( '[data-all]' ) ) {
			state.recipes.forEach( ( r ) => ( r.checked = t.checked && ! blocked( r ) ) );
		} else if ( t.matches( '[data-i]' ) ) {
			state.recipes[ +t.dataset.i ].checked = t.checked;
		} else {
			return;
		}
		renderRecipes();
	} );
	// ---------- Recipe modal ----------

	const modal = document.getElementById( 'rh-modal' );
	const RECIPE_TEMPLATE = {
		steps: [ { goto: '/wp-admin/index.php' }, { waitFor: '#dashboard-widgets' }, { expectNoConsoleErrors: true } ],
	};

	function showModal( title, body, footer ) {
		modal.innerHTML = `<div class="rh-modal-inner">
			<header><h2 id="rh-modal-title">${ esc( title ) }</h2>
				<button type="button" class="rh-modal-close" data-close aria-label="${ esc( __( 'Close', 'rehearsals' ) ) }">×</button></header>
			<div class="rh-modal-body">${ body }
				<p class="rh-modal-note" id="rh-modal-note" hidden></p>
				<p class="rh-error" id="rh-modal-error" role="alert" hidden></p></div>
			<footer>${ footer }</footer></div>`;
		if ( ! modal.open ) modal.showModal();
	}

	function modalMessage( id, text ) {
		const el = modal.querySelector( id );
		el.textContent = text;
		el.hidden = ! text;
	}

	// The help keeps its markup in the translated strings (bold labels and code samples); the lists come from the server.
	function stepsHelp() {
		const codes = ( list ) => list.map( ( s ) => `<code>${ esc( s ) }</code>` ).join( ' ' );
		return `<details class="rh-help"><summary>${ esc( __( 'What can a rehearsal do?', 'rehearsals' ) ) }</summary>
			<p>${ /* translators: %s: list of step names, each in <code>. */ sprintf( __( '<b>Steps:</b> %s', 'rehearsals' ), codes( data.steps ) ) }</p>
			<p>${ /* translators: %s: list of matcher names, each in <code>. */ sprintf( __( '<b><code>expect</code> matchers</b> (plus optional <code>"not": true</code>): %s', 'rehearsals' ), codes( data.matchers ) ) }</p>
			<p>${ __( '<b><code>dialog</code></b> answers the next alert, confirm or prompt: <code>{ "dialog": "accept", "value": "prompt text" }</code> or <code>{ "dialog": "dismiss" }</code>. Put it before the step that opens the dialog. Without one, dialogs are dismissed.', 'rehearsals' ) }</p>
			<p>${ __( '<b>Any step</b> takes <code>"optional": true</code> and <code>"timeout"</code> in ms. <code>{{run}}</code> becomes a value unique to each run.', 'rehearsals' ) }</p>
			<p>${ __( '<b><code>"requires"</code></b> lists plugin slugs (folder names, or text domains) that must be active, such as <code>["jetpack"]</code>, or <code>["jetpack or jetpack-premium-analytics"]</code> when any one will do. Without them the rehearsal is shown but can\'t run.', 'rehearsals' ) }</p>
			<p>${ __( '<b><code>"theme"</code></b> names the theme that must be active (or one of a list), such as <code>"twentytwentyfour"</code>; a child of it counts.', 'rehearsals' ) }</p>
			<p>${ __( '<b><code>"role"</code></b> runs the rehearsal as a test user with that role, such as <code>"editor"</code> (created as <code>rehearsal-editor</code> the first time). Without it, it runs as you.', 'rehearsals' ) }</p>
			<p>${ __( '<b><code>"viewport"</code></b> pins the rehearsal to <code>"desktop"</code> or <code>"mobile"</code>, for steps that only work at one size (a button that moves into a menu on phones, say). It then runs at that size whatever the Desktop / Mobile switch says.', 'rehearsals' ) }</p>
			<p>${ __( '<b><code>"format"</code></b> is the rehearsal format it was written in, added when it\'s saved. A rehearsal from a newer version of Rehearsal than this site\'s still runs, with a warning.', 'rehearsals' ) }</p>
			<p>${ /* translators: %s: list of budget keys, each in <code>. */ sprintf( __( '<b>Page loads</b> are measured only when the rehearsal sets <code>"budgets"</code>, e.g. <code>{ "lcp": 2500, "weight": 2097152 }</code>. Pages over a limit get a notice, never a failure. Keys: %s; times in ms, CLS unitless, sizes in compressed bytes.', 'rehearsals' ), codes( data.budgetKeys ) ) }</p>
			<p>${ __( '<b>Selectors:</b> CSS, <code>text=…</code>, <code>role=…</code>, <code>:has-text("…")</code>, and <code>a &gt;&gt; b</code> to look inside <code>a</code> or inside an iframe.', 'rehearsals' ) }</p>
			<p>${ __( '<b><code>"covers"</code></b> labels what the rehearsal exercises, such as <code>["packages/forms"]</code> or <code>["src/checkout/*"]</code>. A CI job can match them against what a change touched and run only the rehearsals that apply. Leave it out for a rehearsal you only run by hand.', 'rehearsals' ) }</p>
		</details>`;
	}

	function openRecipe( r ) {
		const [ cls, label ] = r ? statusOf( r ) : [ '', '' ];
		const info = r
			? `<dl class="rh-m-info">
				<dt>${ esc( __( 'Rehearsal ID', 'rehearsals' ) ) }</dt><dd><code>${ short( r.hash ) }</code></dd>
				<dt>${ esc( __( 'Format', 'rehearsals' ) ) }</dt><dd>${ r.format }${ r.newer ? ` <span class="rh-error">${ esc( newerText( r.format ) ) }</span>` : '' }</dd>
				${ r.recipe.requires ? `<dt>${ esc( __( 'Requires plugins', 'rehearsals' ) ) }</dt><dd>${ esc( r.recipe.requires.join( ', ' ) ) }</dd>` : '' }
				${ r.recipe.theme ? `<dt>${ esc( __( 'Requires theme', 'rehearsals' ) ) }</dt><dd>${ esc( [].concat( r.recipe.theme ).join( ' or ' ) ) }</dd>` : '' }
				${ r.recipe.role ? `<dt>${ esc( __( 'Runs as', 'rehearsals' ) ) }</dt><dd>${ /* translators: 1: role slug, such as editor, 2: the test user's login, such as rehearsal-editor. */ esc( sprintf( __( '%1$s (test user %2$s)', 'rehearsals' ), r.recipe.role, `rehearsal-${ r.recipe.role }` ) ) }</dd>` : '' }
				${ r.recipe.viewport ? `<dt>${ esc( __( 'Screen size', 'rehearsals' ) ) }</dt><dd>${ /* translators: %s: screen size, desktop or mobile. */ esc( sprintf( __( '%s only, whatever the Desktop / Mobile switch says', 'rehearsals' ), r.recipe.viewport ) ) }</dd>` : '' }
				${ blocked( r ) ? `<dt>${ esc( __( "Can't run here", 'rehearsals' ) ) }</dt><dd>${ needsPill( r ) }</dd>` : '' }
				<dt>${ esc( __( 'Last result', 'rehearsals' ) ) }</dt><dd><span class="rh-pill ${ cls }">${ esc( label ) }</span>
					<button type="button" class="button-link" data-runs-for="${ r.id }">${ esc( __( 'See all runs', 'rehearsals' ) ) }</button></dd>
				${ r.source ? `<dt>${ esc( __( 'Installed from', 'rehearsals' ) ) }</dt><dd><a href="${ esc( r.source ) }" target="_blank" rel="noopener">${ esc( r.source ) }</a></dd>` : '' }
			</dl>
			<div class="rh-share">
				<label for="rh-m-share">${ esc( __( 'Share', 'rehearsals' ) ) }</label>
				<div class="rh-share-link"><input id="rh-m-share" type="text" readonly value="${ esc( r.shareUrl ) }">
					<button type="button" class="button" data-copy-share>${ esc( __( 'Copy link', 'rehearsals' ) ) }</button></div>
				<div class="rh-share-as"><span>${ esc( __( 'Copy as:', 'rehearsals' ) ) }</span>
					<button type="button" class="button-link" data-copy-gh title="${ esc( __( 'Summary and folded JSON, for a PR description', 'rehearsals' ) ) }">${ esc( __( 'GitHub', 'rehearsals' ) ) }</button>
					<span aria-hidden="true">·</span>
					<button type="button" class="button-link" data-copy-raw title="${ esc( __( 'The steps as JSON. For scripts, the link plus &format=json returns the same.', 'rehearsals' ) ) }">${ esc( __( 'JSON', 'rehearsals' ) ) }</button>
					<span aria-hidden="true">·</span>
					<button type="button" class="button-link" data-copy-pw title="${ esc( __( 'A standalone .spec.ts file', 'rehearsals' ) ) }">${ esc( __( 'Playwright test', 'rehearsals' ) ) }</button>
					<span aria-hidden="true">·</span>
					<button type="button" class="button-link" data-copy-run-url title="${ esc( __( 'Opening it runs this rehearsal straight away. Add &ref=<label> to find the run again.', 'rehearsals' ) ) }">${ esc( __( 'Run link', 'rehearsals' ) ) }</button>
				</div>
				<p class="rh-muted">${ esc( __( 'Anyone with the link can view and install this rehearsal. Copies use the saved version.', 'rehearsals' ) ) }</p>
			</div>`
			: '';
		showModal(
			r ? r.title : __( 'New rehearsal', 'rehearsals' ),
			`${ info }
			<label class="rh-field" for="rh-m-title">${ esc( __( 'Title', 'rehearsals' ) ) }</label>
			<input id="rh-m-title" type="text" class="widefat" value="${ esc( r ? r.title : '' ) }" placeholder="${ esc( __( 'What this checks, e.g. Forms: responses list loads', 'rehearsals' ) ) }">
			<label class="rh-field" for="rh-m-json">${ esc( __( 'Steps (JSON)', 'rehearsals' ) ) }</label>
			<textarea id="rh-m-json" rows="16" spellcheck="false">${ esc( JSON.stringify( r ? r.recipe : RECIPE_TEMPLATE, null, 2 ) ) }</textarea>
			${ stepsHelp() }`,
			`${ r ? `<button type="button" class="button-link button-link-delete" data-delete>${ esc( __( 'Delete rehearsal', 'rehearsals' ) ) }</button>` : '' }
			<span class="rh-spacer"></span>
			<button type="button" class="button" data-close>${ esc( __( 'Cancel', 'rehearsals' ) ) }</button>
			${ r ? `<button type="button" class="button" data-run-one ${ state.running || blocked( r ) ? 'disabled' : '' }>${ esc( __( 'Save and run', 'rehearsals' ) ) }</button>` : '' }
			<button type="button" class="button button-primary" data-save>${ esc( __( 'Save', 'rehearsals' ) ) }</button>`
		);
		modal.dataset.recipe = r ? r.id : '';
	}

	function recipeJson( r ) {
		return JSON.stringify( r.recipe, null, 2 );
	}

	function showRunsFor( changes ) {
		if ( modal.open ) modal.close();
		document.getElementById( 'rh-runs-heading' ).scrollIntoView( { behavior: 'smooth' } );
		return filterRuns( changes );
	}

	// #run-<id> in the URL shows that run in Recent runs with its log open, so a run's result can be linked to.
	async function showLinkedRun() {
		const m = window.location.hash.match( /^#run-(\d+)$/ );
		if ( ! m ) return;
		await showRunsFor( { search: '#' + m[ 1 ], recipe: '', status: '', user: '' } );
		const details = document.querySelector( '#rh-history details' );
		if ( details ) details.open = true;
	}
	window.addEventListener( 'hashchange', showLinkedRun );

	function upsertRecipe( saved ) {
		const existing = state.recipes.find( ( r ) => r.id === saved.id );
		if ( existing ) {
			Object.assign( existing, saved );
		} else {
			state.recipes.push( { ...saved, checked: ! blocked( saved ), open: false, live: null } );
		}
		state.recipes.sort( ( a, b ) => a.title.localeCompare( b.title ) );
		renderRecipes();
		renderFilterOptions();
		return state.recipes.find( ( r ) => r.id === saved.id );
	}

	async function saveFromModal() {
		modalMessage( '#rh-modal-error', '' );
		let recipe;
		try {
			recipe = JSON.parse( modal.querySelector( '#rh-m-json' ).value );
		} catch ( e ) {
			/* translators: %s: the JSON parser's error message. */
			modalMessage( '#rh-modal-error', sprintf( __( 'The steps are not valid JSON: %s', 'rehearsals' ), e.message ) );
			return null;
		}
		const id = modal.dataset.recipe;
		try {
			const saved = await apiFetch( {
				path: id ? `/rehearsal/v1/rehearsals/${ id }` : '/rehearsal/v1/rehearsals',
				method: 'POST',
				data: { title: modal.querySelector( '#rh-m-title' ).value, recipe },
			} );
			return upsertRecipe( saved );
		} catch ( e ) {
			modalMessage( '#rh-modal-error', e.message || __( 'Could not save the rehearsal.', 'rehearsals' ) );
			return null;
		}
	}

	function openInstall( url ) {
		showModal(
			__( 'Install a rehearsal from a link', 'rehearsals' ),
			`<label class="rh-field" for="rh-m-url">${ esc( __( 'Rehearsal link', 'rehearsals' ) ) }</label>
			<input id="rh-m-url" type="url" class="widefat" value="${ esc( url || '' ) }" placeholder="https://some-site.jurassic.ninja/?rehearsal=…">
			<p class="rh-muted">${ esc( __( "Paste a share link from any site running Rehearsal. You'll see the rehearsal before anything is saved.", 'rehearsals' ) ) }</p>
			<div id="rh-m-preview"></div>`,
			`<span class="rh-spacer"></span>
			<button type="button" class="button" data-close>${ esc( __( 'Cancel', 'rehearsals' ) ) }</button>
			<button type="button" class="button" data-preview>${ esc( __( 'Preview', 'rehearsals' ) ) }</button>
			<button type="button" class="button button-primary" data-do-install disabled>${ esc( __( 'Install', 'rehearsals' ) ) }</button>`
		);
		modal.dataset.recipe = '';
		if ( url ) previewInstall();
	}

	// The selected rehearsals as one Playwright file, with the steps to run it from a terminal or CI.
	async function openPlaywright() {
		const close = `<span class="rh-spacer"></span><button type="button" class="button" data-close>${ esc( __( 'Close', 'rehearsals' ) ) }</button>`;
		const picked = state.recipes.filter( ( r ) => r.checked );
		if ( ! picked.length ) {
			showModal( __( 'Run in Playwright', 'rehearsals' ), `<p>${ esc( __( 'Select the rehearsals to export with the checkboxes in the list, then try again.', 'rehearsals' ) ) }</p>`, close );
			return;
		}
		showModal( __( 'Run in Playwright', 'rehearsals' ), `<p class="rh-muted">${ esc( __( 'Preparing the test file…', 'rehearsals' ) ) }</p>`, close );
		let url;
		try {
			url = ( await apiFetch( { path: '/rehearsal/v1/bundle', method: 'POST', data: { ids: picked.map( ( r ) => r.id ) } } ) ).url;
		} catch ( e ) {
			modalMessage( '#rh-modal-error', e.message || __( 'Could not prepare the test file.', 'rehearsals' ) );
			return;
		}
		const site = data.homeUrl;
		const roles = [ ...new Set( picked.map( ( r ) => r.recipe.role ).filter( ( role ) => role && role !== 'administrator' ) ) ];
		const env = ( role ) => 'STORAGE_STATE_' + role.toUpperCase().replace( /-/g, '_' );
		const cmd = ( text ) => `<div class="rh-cmd"><code>${ esc( text ) }</code><button type="button" class="button button-small" data-copy-cmd>${ esc( __( 'Copy', 'rehearsals' ) ) }</button></div>`;
		const run = [ 'STORAGE_STATE=auth.json', ...roles.map( ( role ) => `${ env( role ) }=auth-${ role }.json` ), 'npx playwright test rehearsals.spec.ts' ].join( ' ' );
		const roleLogins = roles
			.map( ( role ) => `<p class="rh-muted">${ /* translators: %s: role slug, such as editor. */ sprintf( esc( __( 'Some rehearsals run as %s, so save a session for a user with that role too:', 'rehearsals' ) ), `<b>${ esc( role ) }</b>` ) }</p>${ cmd( `npx playwright open --save-storage=auth-${ role }.json ${ site }wp-login.php` ) }` )
			.join( '' );
		showModal(
			/* translators: %d: number of rehearsals. */
			sprintf( _n( 'Run %d rehearsal in Playwright', 'Run %d rehearsals in Playwright', picked.length, 'rehearsals' ), picked.length ),
			`<p>${ esc( __( 'The selected rehearsals as one Playwright test file, to run from your computer or CI.', 'rehearsals' ) ) }</p>
			<ol class="rh-steps">
				<li><b>${ esc( __( 'Get the tests.', 'rehearsals' ) ) }</b> <a class="button button-primary" href="${ esc( url ) }&amp;download=1">${ /* translators: %s: file name. */ esc( sprintf( __( 'Download %s', 'rehearsals' ), 'rehearsals.spec.ts' ) ) }</a>
					<span class="rh-muted">${ esc( __( 'or fetch them, for example in CI:', 'rehearsals' ) ) }</span>${ cmd( `curl -o rehearsals.spec.ts "${ url }"` ) }</li>
				<li>${ __( '<b>Install Playwright</b>, once, in the same folder:', 'rehearsals' ) }${ cmd( 'npm i -D @playwright/test && npx playwright install chromium' ) }</li>
				<li>${ __( '<b>Save a logged-in session</b>, once: log in as an administrator in the browser that opens, then close it.', 'rehearsals' ) }${ cmd( `npx playwright open --save-storage=auth.json ${ site }wp-login.php` ) }${ roleLogins }</li>
				<li><b>${ esc( __( 'Run them.', 'rehearsals' ) ) }</b>${ cmd( run ) }
					<p class="rh-muted">${ __( 'Add <code>--headed</code> to watch them, <code>BASE_URL=https://another-site/</code> to test another site, and see the results with <code>npx playwright show-report</code>.', 'rehearsals' ) }</p></li>
			</ol>
			<p class="rh-muted">${ esc( __( 'The link returns exactly these rehearsals while this site exists. Rehearsals that change the site change it in Playwright too.', 'rehearsals' ) ) }</p>`,
			close
		);
	}

	// What the latest preview showed; Install installs exactly that, or the server refuses.
	let previewed = null;
	let previewRequest = 0;

	async function previewInstall() {
		const mine = ++previewRequest;
		previewed = null;
		modalMessage( '#rh-modal-error', '' );
		const box = modal.querySelector( '#rh-m-preview' );
		const button = modal.querySelector( '[data-do-install]' );
		button.disabled = true;
		box.innerHTML = `<p class="rh-muted">${ esc( __( 'Fetching the rehearsal…', 'rehearsals' ) ) }</p>`;
		const url = modal.querySelector( '#rh-m-url' ).value.trim();
		try {
			const p = await apiFetch( {
				path: '/rehearsal/v1/install',
				method: 'POST',
				data: { url, dry_run: true },
			} );
			if ( mine !== previewRequest ) return; // A later preview replaced this one.
			previewed = { url, id: p.id };
			const missing = ( m ) => {
				if ( m.kind === 'role' ) {
					/* translators: %s: role slug, such as editor. */
					return sprintf( __( 'the "%s" role', 'rehearsals' ), m.name );
				}
				if ( m.kind === 'theme' ) {
					return m.state === 'inactive'
						? /* translators: %s: theme name. */ sprintf( __( 'theme %s (not active)', 'rehearsals' ), m.name )
						: /* translators: %s: theme name. */ sprintf( __( 'theme %s (not installed)', 'rehearsals' ), m.name );
				}
				return m.state === 'inactive'
					? /* translators: %s: plugin name. */ sprintf( __( '%s (not active)', 'rehearsals' ), m.name )
					: /* translators: %s: plugin name. */ sprintf( __( '%s (not installed)', 'rehearsals' ), m.name );
			};
			box.innerHTML = `<dl class="rh-m-info">
					<dt>${ esc( __( 'Title', 'rehearsals' ) ) }</dt><dd>${ esc( p.title ) }</dd>
					<dt>${ esc( __( 'Rehearsal ID', 'rehearsals' ) ) }</dt><dd><code>${ short( p.id ) }</code></dd>
					<dt>${ esc( __( 'Steps', 'rehearsals' ) ) }</dt><dd>${ p.recipe.steps.length }</dd>
					<dt>${ esc( __( 'Runs in CI when', 'rehearsals' ) ) }</dt><dd>${ esc( p.recipe.covers ? /* translators: %s: comma-separated list of labels the rehearsal covers. */ sprintf( __( '%s changes', 'rehearsals' ), p.recipe.covers.join( ', ' ) ) : __( 'never: manual only', 'rehearsals' ) ) }</dd>
					<dt>${ esc( __( 'Shared from', 'rehearsals' ) ) }</dt><dd>${ /* translators: 1: site URL, 2: what the site runs: WordPress, theme and plugin versions. */ esc( sprintf( __( '%1$s (%2$s)', 'rehearsals' ), p.site, p.build ) ) }</dd>
					<dt>${ esc( __( 'Requires plugins', 'rehearsals' ) ) }</dt><dd>${ esc( p.recipe.requires ? p.recipe.requires.join( ', ' ) : __( 'None', 'rehearsals' ) ) }</dd>
					<dt>${ esc( __( 'Requires theme', 'rehearsals' ) ) }</dt><dd>${ esc( p.recipe.theme ? [].concat( p.recipe.theme ).join( ' or ' ) : __( 'Any', 'rehearsals' ) ) }</dd>
					<dt>${ esc( __( 'Runs as', 'rehearsals' ) ) }</dt><dd>${ esc( p.recipe.role ? p.recipe.role : __( 'you (the logged-in admin)', 'rehearsals' ) ) }</dd>
					<dt>${ esc( __( 'Screen size', 'rehearsals' ) ) }</dt><dd>${ esc( p.recipe.viewport ? /* translators: %s: screen size, desktop or mobile. */ sprintf( __( '%s only', 'rehearsals' ), p.recipe.viewport ) : __( 'Any', 'rehearsals' ) ) }</dd>
					<dt>${ esc( __( 'Format', 'rehearsals' ) ) }</dt><dd>${ esc( p.shared_by ? /* translators: 1: rehearsal format number, 2: Rehearsal plugin version. */ sprintf( __( '%1$d (shared by a site running Rehearsal %2$s)', 'rehearsals' ), p.format, p.shared_by ) : p.format ) }</dd>
				</dl>
				${ p.missing && p.missing.length ? `<p class="rh-error">${ /* translators: %s: comma-separated list of what the rehearsal needs, such as Jetpack (not active). */ esc( sprintf( __( "This site is missing what it needs: %s. You can install it, but it won't run until they are active.", 'rehearsals' ), p.missing.map( missing ).join( ', ' ) ) ) }</p>` : '' }
				${ p.newer ? `<p class="rh-error">${ esc( newerText( p.format ) ) }</p>` : '' }
				${ p.updates ? `<p class="rh-modal-note">${ esc( __( 'You installed this link before. Installing again replaces your copy with this version.', 'rehearsals' ) ) }</p>` : '' }
				<details><summary>${ esc( __( 'Steps', 'rehearsals' ) ) }</summary><pre class="rh-m-pre">${ esc( JSON.stringify( p.recipe, null, 2 ) ) }</pre></details>`;
			button.disabled = false;
			button.textContent = p.updates ? __( 'Update my copy', 'rehearsals' ) : __( 'Install', 'rehearsals' );
		} catch ( e ) {
			if ( mine !== previewRequest ) return;
			box.innerHTML = '';
			modalMessage( '#rh-modal-error', e.message || __( 'Could not fetch that link.', 'rehearsals' ) );
		}
	}

	async function doInstall() {
		modalMessage( '#rh-modal-error', '' );
		if ( ! previewed ) return;
		try {
			const saved = await apiFetch( {
				path: '/rehearsal/v1/install',
				method: 'POST',
				data: { url: previewed.url, expect: previewed.id },
			} );
			const r = upsertRecipe( saved );
			openRecipe( r );
			modalMessage( '#rh-modal-note', saved.updated ? __( 'Updated your copy to this version.', 'rehearsals' ) : __( 'Installed. Run it from here or from the list.', 'rehearsals' ) );
		} catch ( e ) {
			modalMessage( '#rh-modal-error', e.message || __( 'Could not install the rehearsal.', 'rehearsals' ) );
		}
	}

	modal.addEventListener( 'click', async ( e ) => {
		if ( e.target === modal ) return modal.close(); // Backdrop.
		const t = e.target.closest( 'button' );
		if ( ! t || t.disabled ) return;
		const id = Number( modal.dataset.recipe );
		// REST calls on slow hosts can take seconds; show that the click registered.
		const busy = ( label ) => {
			const old = t.textContent;
			t.disabled = true;
			t.textContent = label;
			return () => {
				t.disabled = false;
				t.textContent = old;
			};
		};
		if ( t.matches( '[data-close]' ) ) modal.close();
		if ( t.matches( '[data-copy-share]' ) ) copy( modal.querySelector( '#rh-m-share' ).value, t );
		if ( t.matches( '[data-copy-cmd]' ) ) copy( t.previousElementSibling.textContent, t );
		const current = state.recipes.find( ( r ) => r.id === id );
		// Built by the server, the same block as &format=github and wp rehearsal block.
		if ( t.matches( '[data-copy-gh]' ) ) copyFetched( `${ current.shareUrl }&format=github`, t );
		if ( t.matches( '[data-copy-run-url]' ) ) copy( current.runUrl, t );
		if ( t.matches( '[data-copy-raw]' ) ) copy( recipeJson( current ), t );
		if ( t.matches( '[data-copy-pw]' ) ) copyFetched( `${ current.shareUrl }&format=playwright`, t );
		if ( t.matches( '[data-runs-for]' ) ) showRunsFor( { recipe: t.dataset.runsFor } );
		if ( t.matches( '[data-preview]' ) ) previewInstall();
		if ( t.matches( '[data-do-install]' ) ) {
			const done = busy( __( 'Installing…', 'rehearsals' ) );
			await doInstall();
			done();
		}
		if ( t.matches( '[data-save]' ) ) {
			const done = busy( __( 'Saving…', 'rehearsals' ) );
			const r = await saveFromModal();
			done();
			if ( r ) {
				openRecipe( r );
				/* translators: %s: short rehearsal ID. */
				modalMessage( '#rh-modal-note', sprintf( __( 'Saved. Rehearsal ID is now %s.', 'rehearsals' ), short( r.hash ) ) );
			}
		}
		if ( t.matches( '[data-run-one]' ) ) {
			const r = await saveFromModal();
			if ( r ) {
				modal.close();
				runRecipes( [ r ] );
			}
		}
		if ( t.matches( '[data-delete]' ) ) {
			if ( ! t.dataset.armed ) {
				t.dataset.armed = '1';
				t.textContent = __( 'Click again to delete', 'rehearsals' );
				return;
			}
			const done = busy( __( 'Deleting…', 'rehearsals' ) );
			try {
				await apiFetch( { path: `/rehearsal/v1/rehearsals/${ id }`, method: 'DELETE' } );
				state.recipes = state.recipes.filter( ( r ) => r.id !== id );
				renderRecipes();
				renderFilterOptions();
				modal.close();
			} catch ( err ) {
				done();
				modalMessage( '#rh-modal-error', err.message || __( 'Could not delete the rehearsal.', 'rehearsals' ) );
			}
		}
	} );
	modal.addEventListener( 'keydown', ( e ) => {
		if ( e.key === 'Enter' && e.target.id === 'rh-m-url' ) {
			e.preventDefault();
			previewInstall();
		}
	} );
	modal.addEventListener( 'input', ( e ) => {
		if ( e.target.id === 'rh-m-url' && previewed && e.target.value.trim() !== previewed.url ) {
			previewed = null;
			modal.querySelector( '[data-do-install]' ).disabled = true;
		}
	} );
	document.getElementById( 'rh-add' ).addEventListener( 'click', () => openRecipe( null ) );
	document.getElementById( 'rh-install' ).addEventListener( 'click', () => openInstall( '' ) );
	document.getElementById( 'rh-playwright' ).addEventListener( 'click', openPlaywright );

	let searchTimer;
	document.getElementById( 'rh-f-search' ).addEventListener( 'input', ( e ) => {
		clearTimeout( searchTimer );
		searchTimer = setTimeout( () => filterRuns( { search: e.target.value.trim() } ), 300 );
	} );
	[
		[ 'rh-f-recipe', 'recipe' ],
		[ 'rh-f-status', 'status' ],
		[ 'rh-f-user', 'user' ],
	].forEach( ( [ id, key ] ) => document.getElementById( id ).addEventListener( 'change', ( e ) => filterRuns( { [ key ]: e.target.value } ) ) );
	document.getElementById( 'rh-f-clear' ).addEventListener( 'click', () => filterRuns( { search: '', recipe: '', status: '', user: '' } ) );
	document.getElementById( 'rh-more' ).addEventListener( 'click', () => loadRuns( true ) );

	root.addEventListener( 'click', ( e ) => {
		const runsFor = e.target.closest( '[data-runs-for]' );
		if ( runsFor && ! modal.contains( runsFor ) ) showRunsFor( { recipe: runsFor.dataset.runsFor } );
		const byUser = e.target.closest( '[data-filter-user]' );
		if ( byUser ) showRunsFor( { user: byUser.dataset.filterUser } );
		const runRow = e.target.closest( '[data-run-row]' );
		if ( runRow && ! runRow.disabled ) runRecipes( [ state.recipes[ +runRow.dataset.runRow ] ] );
		const opener = e.target.closest( '[data-open]' );
		if ( opener ) openRecipe( state.recipes[ +opener.dataset.open ] );
		const t = e.target.closest( '[data-toggle]' );
		if ( t ) {
			const r = state.recipes[ +t.dataset.toggle ];
			r.open = ! r.open;
			renderRecipes();
		}
		const fromRecipe = e.target.closest( '[data-copy-recipe]' );
		if ( fromRecipe ) {
			const r = state.recipes[ +fromRecipe.dataset.copyRecipe ];
			const run = r.live ? null : r.lastRun;
			copy( errorsText( r.live ? r.live.errors : run.errors, run, r.title ), fromRecipe );
		}
		const fromRun = e.target.closest( '[data-copy-run]' );
		if ( fromRun ) {
			const run = state.runs.find( ( x ) => String( x.id ) === fromRun.dataset.copyRun );
			copy( errorsText( run.errors, run, run.title ), fromRun );
		}
	} );

	// ---------- The runner ----------

	function frameDoc() {
		try {
			return frame.contentDocument;
		} catch ( e ) {
			return null;
		}
	}

	function onSiteDoc() {
		const doc = frameDoc();
		if ( ! doc ) {
			throw new Error( __( 'The frame left this site, so the browser cannot read it. This rehearsal needs the Playwright runner.', 'rehearsals' ) );
		}
		return doc;
	}

	function visible( el ) {
		return !! el && !! ( el.offsetWidth || el.offsetHeight || el.getClientRects().length );
	}

	// Every match, visible or not, in document order. `a >> b` finds b inside each a, and inside a's document when a is an iframe.
	function findAll( doc, sel ) {
		let scopes = [ doc ];
		for ( const part of sel.split( /\s+>>\s+/ ) ) {
			const next = new Set();
			for ( const scope of scopes ) {
				const root = scope.tagName === 'IFRAME' ? scope.contentDocument : scope;
				if ( root ) findIn( root, part ).forEach( ( el ) => next.add( el ) );
			}
			scopes = [ ...next ];
		}
		return scopes;
	}

	function findIn( root, sel ) {
		const base = root.body || root;
		if ( sel.startsWith( 'text=' ) ) {
			const want = norm( sel.slice( 5 ) );
			const found = new Set();
			const walker = ( root.ownerDocument || root ).createTreeWalker( base, 4 /* NodeFilter.SHOW_TEXT */ );
			for ( let n = walker.nextNode(); n; n = walker.nextNode() ) {
				if ( norm( n.nodeValue ).includes( want ) ) found.add( n.parentElement );
			}
			base.querySelectorAll( 'input[type=submit], input[type=button]' ).forEach( ( el ) => norm( el.value ).includes( want ) && found.add( el ) );
			base.querySelectorAll( '[aria-label]' ).forEach( ( el ) => norm( el.getAttribute( 'aria-label' ) ).includes( want ) && found.add( el ) );
			return [ ...found ];
		}
		let css = sel;
		let hasText = null;
		// Like Playwright's :has-text(), but only on the last compound selector of a part.
		const m = css.match( /:has-text\((["'])(.*?)\1\)/ );
		if ( m ) {
			hasText = norm( m[ 2 ] );
			css = css.replace( m[ 0 ], '' ) || '*';
		}
		if ( css.startsWith( 'role=' ) ) {
			const role = css.slice( 5 );
			css = `[role="${ CSS.escape( role ) }"]` + ( IMPLICIT_ROLES[ role ] ? `, ${ IMPLICIT_ROLES[ role ] }` : '' );
		}
		// Query the document itself, not its body, so `body` and `html` can match.
		const els = [ ...root.querySelectorAll( css ) ];
		return hasText === null ? els : els.filter( ( el ) => norm( el.innerText || el.textContent ).includes( hasText ) );
	}

	function find( doc, sel ) {
		return findAll( doc, sel ).find( visible ) || null;
	}

	function isDisabled( el ) {
		return !! ( el.disabled || el.getAttribute( 'aria-disabled' ) === 'true' || el.closest( 'fieldset[disabled]' ) );
	}

	// Labels and wrappers resolve to the checkbox or radio they control.
	function toggleTarget( el ) {
		if ( el.matches( 'input[type=checkbox], input[type=radio]' ) ) return el;
		return el.control || el.querySelector( 'input[type=checkbox], input[type=radio]' ) || el;
	}

	const MATCHERS = {
		toBeVisible: () => ( els ) => els.some( visible ),
		toHaveCount: ( n ) => ( els ) => els.length === n,
		toHaveText: ( text ) => ( els, el ) => !! el && norm( el.innerText ) === norm( text ),
		toContainText: ( text ) => ( els, el ) => !! el && norm( el.innerText ).includes( norm( text ) ),
		toBeEnabled: () => ( els, el ) => !! el && ! isDisabled( el ),
		toBeDisabled: () => ( els, el ) => !! el && isDisabled( el ),
		toBeChecked: () => ( els, el ) => !! el && !! toggleTarget( el ).checked,
		toHaveValue: ( value ) => ( els, el ) => !! el && String( el.value ) === String( value ),
	};

	// What the page showed, for timeout messages.
	function actual( name, els, el ) {
		/* translators: %d: number of matching elements. */
		if ( name === 'toHaveCount' ) return sprintf( _n( '%d found', '%d found', els.length, 'rehearsals' ), els.length );
		if ( name === 'toBeVisible' ) {
			/* translators: %d: number of matching elements. */
			return els.length ? sprintf( _n( '%d found, none visible', '%d found, none visible', els.length, 'rehearsals' ), els.length ) : __( 'no match', 'rehearsals' );
		}
		if ( ! el ) return __( 'no visible match', 'rehearsals' );
		if ( name === 'toHaveText' || name === 'toContainText' ) return `“${ norm( el.innerText ).slice( 0, 120 ) }”`;
		if ( name === 'toHaveValue' ) return `“${ el.value }”`;
		if ( name === 'toBeChecked' ) return toggleTarget( el ).checked ? __( 'checked', 'rehearsals' ) : __( 'unchecked', 'rehearsals' );
		return isDisabled( el ) ? __( 'disabled', 'rehearsals' ) : __( 'enabled', 'rehearsals' );
	}

	function keyEvent( win, type, combo ) {
		const parts = combo.split( '+' );
		const key = parts.pop();
		const mods = parts.map( ( m ) => m.toLowerCase() );
		return new win.KeyboardEvent( type, {
			key: key === 'Space' ? ' ' : key,
			code: key.length === 1 ? 'Key' + key.toUpperCase() : key,
			bubbles: true,
			cancelable: true,
			ctrlKey: mods.includes( 'control' ),
			metaKey: mods.includes( 'meta' ),
			shiftKey: mods.includes( 'shift' ),
			altKey: mods.includes( 'alt' ),
		} );
	}

	// Synthetic key events don't trigger browser defaults, so emulate the few rehearsals rely on.
	function keyDefault( doc, el, combo ) {
		const key = combo.split( '+' ).pop();
		const selectAll = /^(control|meta)\+a$/i.test( combo );
		if ( selectAll && typeof el.select === 'function' ) {
			el.select();
		} else if ( key === 'Enter' && el.matches( 'input:not([type=checkbox]):not([type=radio])' ) && el.form ) {
			el.form.requestSubmit();
		} else if ( ( key === 'Enter' || key === 'Space' || key === ' ' ) && el.matches( 'button, a[href], input[type=submit], input[type=button], input[type=checkbox], input[type=radio], [role=button]' ) ) {
			el.click();
		} else if ( key === 'Tab' ) {
			const focusable = [ ...doc.querySelectorAll( 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])' ) ].filter(
				( f ) => visible( f ) && ! f.disabled
			);
			const next = focusable[ focusable.indexOf( el ) + ( combo.startsWith( 'Shift' ) ? -1 : 1 ) ];
			if ( next ) next.focus();
		}
	}

	// Copies new recorder entries into the run, so errors survive the page navigating away.
	function harvest( run ) {
		const doc = frameDoc();
		const win = frame.contentWindow;
		if ( ! doc || ! win || ! win.__rehearsal ) return;
		const from = win.__rehearsalSeen || 0;
		win.__rehearsal.errors
			.slice( from )
			.forEach( ( e ) => run.errors.push( { page: win.location.pathname + win.location.search, msg: e.msg, source: e.source } ) );
		win.__rehearsalSeen = win.__rehearsal.errors.length;
		( win.__rehearsal.dialogs || [] ).slice( win.__rehearsalDialogsSeen || 0 ).forEach( ( d ) => run.dialogs.push( d ) );
		win.__rehearsalDialogsSeen = ( win.__rehearsal.dialogs || [] ).length;
		// One metrics object per document (the frame keeps its window across navigations); it keeps updating until the recorder freezes it after load.
		const m = win.__rehearsal.metrics && win.__rehearsal.metrics();
		if ( m && run.pages ) {
			if ( run.pageDoc !== doc ) {
				run.pageDoc = doc;
				const page = { ...m };
				run.pages.push( page );
				run.newPages.push( page );
			} else if ( run.pages.length ) {
				// Same document as before; nothing to update when it's the page a previous rehearsal left behind.
				Object.assign( run.pages[ run.pages.length - 1 ], m );
			}
		}
	}


	function assess( page, budget ) {
		page.warn = Object.keys( budget ).filter( ( k ) => page[ k ] !== null && page[ k ] !== undefined && page[ k ] > budget[ k ] );
		page.limits = Object.fromEntries( page.warn.map( ( k ) => [ k, budget[ k ] ] ) );
	}

	async function until( run, fn, label, timeout ) {
		let spent = 0;
		let last = performance.now();
		for ( ;; ) {
			harvest( run );
			const value = fn();
			if ( value ) return value;
			const now = performance.now();
			// Browsers throttle background tabs; only count time while this tab is visible.
			if ( ! document.hidden ) spent += now - last;
			last = now;
			if ( spent > timeout ) {
				/* translators: 1: number of seconds, 2: what the step waited for, such as a selector. */
				const err = new Error( sprintf( __( 'Timed out after %1$s s waiting for %2$s', 'rehearsals' ), timeout / 1000, label ) );
				// Kept so a step can say more in one sentence (see click and expect).
				err.timeout = true;
				err.seconds = timeout / 1000;
				err.label = label;
				throw err;
			}
			await sleep( 100 );
		}
	}

	function load( url, timeout ) {
		return new Promise( ( resolve, reject ) => {
			const timer = setTimeout( () => {
				frame.onload = null;
				/* translators: 1: number of seconds, 2: URL. */
				reject( new Error( sprintf( __( 'Timed out after %1$s s loading %2$s', 'rehearsals' ), timeout / 1000, url ) ) );
			}, timeout );
			frame.onload = () => {
				clearTimeout( timer );
				frame.onload = null;
				resolve();
			};
			frame.src = url;
		} );
	}

	function resolve( path ) {
		const url = path.startsWith( '/wp-admin/' )
			? data.adminUrl + path.slice( '/wp-admin/'.length )
			: data.homeUrl + path.replace( /^\//, '' );
		if ( new URL( url ).origin !== window.location.origin ) {
			/* translators: %s: URL. */
			throw new Error( sprintf( __( '%s is on another domain than wp-admin. This rehearsal needs the Playwright runner.', 'rehearsals' ), url ) );
		}
		return url;
	}

	// What each step returns is its log line in the step vocabulary (goto, click, …), the same as the Playwright
	// runner's, so it stays untranslated; the errors it throws are sentences for people, so they are translated.
	async function exec( run, step, timeout ) {
		if ( 'goto' in step ) {
			const url = resolve( step.goto );
			harvest( run );
			document.getElementById( 'rh-frame-url' ).textContent = url;
			document.getElementById( 'rh-frame-idle' ).hidden = true;
			// Going through about:blank forces a real load even when only the hash differs.
			await load( 'about:blank', timeout );
			await load( url, timeout );
			const doc = onSiteDoc();
			if ( /\/wp-login\.php/.test( frame.contentWindow.location.pathname ) ) {
				throw new Error( __( 'Redirected to the login screen. Are you still logged in?', 'rehearsals' ) );
			}
			// When measuring, give LCP and layout shifts time to settle; a page that never finishes is measured as it is.
			if ( run.pages ) await until( run, () => frame.contentWindow.__rehearsal?.metrics?.().final, __( 'page metrics', 'rehearsals' ), 4000 ).catch( () => {} );
			harvest( run );
			return `goto ${ step.goto } (${ doc.title || 'untitled' })`;
		}
		if ( 'waitFor' in step ) {
			await until( run, () => find( onSiteDoc(), step.waitFor ), step.waitFor, timeout );
			return `waitFor ${ step.waitFor }`;
		}
		if ( 'expectText' in step ) {
			const want = norm( step.expectText );
			await until(
				run,
				() => {
					const doc = onSiteDoc();
					const scope = step.in ? find( doc, step.in ) : doc.body;
					return scope && norm( scope.innerText ).includes( want );
				},
				step.in
					? /* translators: 1: the text to find, 2: selector it should be in. */ sprintf( __( 'text “%1$s” in %2$s', 'rehearsals' ), step.expectText, step.in )
					: /* translators: %s: the text to find. */ sprintf( __( 'text “%s”', 'rehearsals' ), step.expectText ),
				timeout
			);
			return `expectText “${ step.expectText }”`;
		}
		if ( 'expectCount' in step ) {
			const min = step.min ?? 1;
			const count = () => findAll( onSiteDoc(), step.expectCount ).length;
			/* translators: 1: minimum number of matches, 2: selector. */
			await until( run, () => count() >= min, sprintf( __( 'at least %1$d × %2$s', 'rehearsals' ), min, step.expectCount ), timeout );
			return `expectCount ${ step.expectCount } ≥ ${ min } (found ${ count() })`;
		}
		if ( 'fill' in step ) {
			const el = await until( run, () => find( onSiteDoc(), step.fill ), step.fill, timeout );
			const win = el.ownerDocument.defaultView;
			el.focus( { preventScroll: true } );
			// React tracks the value itself, so a plain `el.value =` is ignored; go through the native setter.
			Object.getOwnPropertyDescriptor( Object.getPrototypeOf( el ), 'value' ).set.call( el, String( step.value ?? '' ) );
			el.dispatchEvent( new win.Event( 'input', { bubbles: true } ) );
			el.dispatchEvent( new win.Event( 'change', { bubbles: true } ) );
			return `fill ${ step.fill } = “${ step.value }”`;
		}
		if ( 'click' in step ) {
			// Like Playwright, wait for the element to be enabled too: a save button often is only once the form is ready.
			let disabled = false;
			const el = await until(
				run,
				() => {
					const found = find( onSiteDoc(), step.click );
					disabled = !! found && isDisabled( found );
					return ! disabled && found;
				},
				step.click,
				timeout
			).catch( ( e ) => {
				throw e.timeout && disabled
					? /* translators: 1: number of seconds, 2: selector. */ new Error( sprintf( __( 'Timed out after %1$s s waiting for %2$s to be enabled (it stayed disabled)', 'rehearsals' ), e.seconds, e.label ) )
					: e;
			} );
			const link = el.closest( 'a[target="_blank"][href]' );
			if ( link ) {
				// A new tab would escape the runner, so load the link in the frame like Playwright following a popup.
				if ( new URL( link.href ).origin !== window.location.origin ) {
					/* translators: %s: URL. */
					throw new Error( sprintf( __( '%s opens another site in a new tab. This rehearsal needs the Playwright runner.', 'rehearsals' ), link.href ) );
				}
				harvest( run );
				document.getElementById( 'rh-frame-url' ).textContent = link.href;
				await load( link.href, timeout );
				return `click ${ step.click } (new-tab link loaded in the frame)`;
			}
			el.click();
			return `click ${ step.click }`;
		}
		if ( 'expect' in step ) {
			const name = Object.keys( MATCHERS ).find( ( m ) => m in step );
			/* translators: %s: comma-separated list of matcher names. */
			if ( ! name ) throw new Error( sprintf( __( '"expect" needs one of: %s', 'rehearsals' ), Object.keys( MATCHERS ).join( ', ' ) ) );
			const test = MATCHERS[ name ]( step[ name ] );
			const arg = typeof step[ name ] === 'boolean' ? '' : ` ${ JSON.stringify( step[ name ] ) }`;
			const label = `expect ${ step.expect }${ step.not ? ' not' : '' } ${ name }${ arg }`;
			let seen = '';
			try {
				await until(
					run,
					() => {
						const els = findAll( onSiteDoc(), step.expect );
						const el = els.find( visible ) || null;
						seen = actual( name, els, el );
						return test( els, el ) !== !! step.not;
					},
					label,
					timeout
				);
			} catch ( e ) {
				throw e.timeout
					? /* translators: 1: number of seconds, 2: what the step checked, 3: what the page showed instead. */ new Error( sprintf( __( 'Timed out after %1$s s waiting for %2$s (page showed: %3$s)', 'rehearsals' ), e.seconds, e.label, seen ) )
					: e;
			}
			return label;
		}
		if ( 'check' in step || 'uncheck' in step ) {
			const want = 'check' in step;
			const sel = want ? step.check : step.uncheck;
			const el = toggleTarget( await until( run, () => find( onSiteDoc(), sel ), sel, timeout ) );
			/* translators: %s: selector. */
			if ( ! el.matches( 'input[type=checkbox], input[type=radio]' ) ) throw new Error( sprintf( __( '%s is not a checkbox or radio button', 'rehearsals' ), sel ) );
			/* translators: %s: selector. */
			if ( ! want && el.type === 'radio' ) throw new Error( sprintf( __( '%s is a radio button, which cannot be unchecked', 'rehearsals' ), sel ) );
			if ( el.checked !== want ) el.click();
			if ( el.checked !== want ) {
				throw new Error(
					el.checked
						? /* translators: %s: selector. */ sprintf( __( '%s is still checked after clicking it', 'rehearsals' ), sel )
						: /* translators: %s: selector. */ sprintf( __( '%s is still unchecked after clicking it', 'rehearsals' ), sel )
				);
			}
			return `${ want ? 'check' : 'uncheck' } ${ sel }`;
		}
		if ( 'selectOption' in step ) {
			const el = await until( run, () => find( onSiteDoc(), step.selectOption ), step.selectOption, timeout );
			/* translators: %s: selector. */
			if ( el.tagName !== 'SELECT' ) throw new Error( sprintf( __( '%s is not a <select>', 'rehearsals' ), step.selectOption ) );
			const want = String( step.value );
			const option = [ ...el.options ].find( ( o ) => o.value === want ) || [ ...el.options ].find( ( o ) => norm( o.text ) === norm( want ) );
			/* translators: 1: selector, 2: the option value or label the step asked for. */
			if ( ! option ) throw new Error( sprintf( __( '%1$s has no option with value or label “%2$s”', 'rehearsals' ), step.selectOption, want ) );
			const win = el.ownerDocument.defaultView;
			Object.getOwnPropertyDescriptor( win.HTMLSelectElement.prototype, 'value' ).set.call( el, option.value );
			el.dispatchEvent( new win.Event( 'input', { bubbles: true } ) );
			el.dispatchEvent( new win.Event( 'change', { bubbles: true } ) );
			return `selectOption ${ step.selectOption } = “${ option.text.trim() }”`;
		}
		if ( 'hover' in step ) {
			const el = await until( run, () => find( onSiteDoc(), step.hover ), step.hover, timeout );
			const win = el.ownerDocument.defaultView;
			const r = el.getBoundingClientRect();
			const at = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
			[ 'pointerover', 'pointerenter', 'pointermove' ].forEach( ( t ) =>
				el.dispatchEvent( new win.PointerEvent( t, { ...at, bubbles: t !== 'pointerenter' } ) )
			);
			[ 'mouseover', 'mouseenter', 'mousemove' ].forEach( ( t ) => el.dispatchEvent( new win.MouseEvent( t, { ...at, bubbles: t !== 'mouseenter' } ) ) );
			return `hover ${ step.hover }`;
		}
		if ( 'press' in step ) {
			const doc = onSiteDoc();
			const el = step.on ? await until( run, () => find( onSiteDoc(), step.on ), step.on, timeout ) : doc.activeElement || doc.body;
			if ( step.on ) el.focus( { preventScroll: true } );
			const win = el.ownerDocument.defaultView;
			const down = el.dispatchEvent( keyEvent( win, 'keydown', step.press ) );
			if ( down ) keyDefault( el.ownerDocument, el, step.press );
			el.dispatchEvent( keyEvent( win, 'keyup', step.press ) );
			return `press ${ step.press }${ step.on ? ' on ' + step.on : '' }`;
		}
		if ( 'expectNoConsoleErrors' in step ) {
			harvest( run );
			if ( ! frame.contentWindow.__rehearsal ) {
				throw new Error( __( 'This page has no error recorder, so console errors cannot be checked (it needs wp_head or wp-admin, and an admin login).', 'rehearsals' ) );
			}
			const ignore = ( ( step.expectNoConsoleErrors && step.expectNoConsoleErrors.ignore ) || [] ).map( ( p ) => new RegExp( p ) );
			const errors = run.errors.filter( ( e ) => ! ignore.some( ( re ) => re.test( e.msg ) ) );
			if ( errors.length ) {
				run.consoleErrors = groupErrors( errors );
				throw new Error(
					sprintf(
						/* translators: 1: number of console errors, 2: number of distinct ones. */
						_n( '%1$d console error (%2$d distinct), listed below.', '%1$d console errors (%2$d distinct), listed below.', errors.length, 'rehearsals' ),
						errors.length,
						run.consoleErrors.length
					)
				);
			}
			return 'expectNoConsoleErrors';
		}
		if ( 'snapshot' in step ) {
			const el = await until( run, () => find( onSiteDoc(), step.snapshot ), step.snapshot, timeout );
			run.snapshots.push( { selector: step.snapshot, html: el.outerHTML.slice( 0, 100000 ) } );
			return `snapshot ${ step.snapshot } (${ Math.round( el.outerHTML.length / 1024 ) } KB)`;
		}
		if ( 'dialog' in step ) {
			// The frame's recorder answers the next alert, confirm or prompt this way, like Playwright's page.once( 'dialog' ).
			window.__rehearsalDialog = { action: step.dialog, value: step.value };
			return `dialog: ${ step.dialog } the next one`;
		}
		if ( 'screenshot' in step ) {
			throw new Error( __( 'The browser cannot take screenshots. Add "needs": "playwright" to this rehearsal.', 'rehearsals' ) );
		}
		/* translators: %s: the step's keys. */
		throw new Error( sprintf( __( 'Unknown step: %s', 'rehearsals' ), Object.keys( step ).join( ', ' ) ) );
	}

	function clearRoleCookie() {
		document.cookie = 'rehearsal_role=; path=/; max-age=0';
	}

	// A run cut short by a reload or a closed tab leaves its cookies behind, so clear them on the way in and out.
	function clearCookies() {
		clearRoleCookie();
		document.cookie = 'rehearsal_frame=; path=/; max-age=0';
	}
	clearCookies();
	window.addEventListener( 'pagehide', clearCookies );

	// Errors the previous rehearsal's page logged after its last step are not this rehearsal's.
	function ignoreEarlierErrors() {
		try {
			const win = frame.contentWindow;
			if ( win && win.__rehearsal ) {
				win.__rehearsalSeen = win.__rehearsal.errors.length;
				win.__rehearsalDialogsSeen = ( win.__rehearsal.dialogs || [] ).length;
			}
		} catch ( e ) {}
	}

	async function runRecipe( r, ref ) {
		// Saving an edit mid-run updates r in place; the run keeps the rehearsal it started with.
		const { id, hash, title, recipe, newer, format } = r;
		// A rehearsal pinned to one size runs at it, whatever the switch says.
		const view = recipe.viewport || state.viewport;
		state.runViewport = view;
		renderFrameTools();
		clearRoleCookie();
		// pageDoc starts as whatever the last rehearsal left in the frame, so it isn't measured as this run's page.
		// Page loads are measured only for a rehearsal with its own budgets; pages: null switches it off.
		const budget = recipe.budgets || null;
		const run = { log: [], errors: [], snapshots: [], dialogs: [], pages: budget ? [] : null, newPages: [], pageDoc: frameDoc() };
		window.__rehearsalDialog = null;
		// Dialogs and page loads seen while a step ran are shown on that step's log line.
		const attachPages = ( entry ) => {
			harvest( run );
			run.dialogs.splice( 0 ).forEach( ( d ) => {
				let note;
				if ( d.action === 'accept' ) {
					note = d.answered
						? /* translators: 1: dialog type: alert, confirm or prompt, 2: the dialog's message. */ __( '%1$s “%2$s” accepted', 'rehearsals' )
						: /* translators: 1: dialog type: alert, confirm or prompt, 2: the dialog's message. */ __( '%1$s “%2$s” accepted (no dialog step before it)', 'rehearsals' );
				} else {
					note = d.answered
						? /* translators: 1: dialog type: alert, confirm or prompt, 2: the dialog's message. */ __( '%1$s “%2$s” dismissed', 'rehearsals' )
						: /* translators: 1: dialog type: alert, confirm or prompt, 2: the dialog's message. */ __( '%1$s “%2$s” dismissed (no dialog step before it)', 'rehearsals' );
				}
				entry.msg += ' · ' + sprintf( note, d.type, d.message );
			} );
			if ( ! budget ) return entry;
			if ( run.newPages.length ) entry.pages = run.newPages.splice( 0 );
			run.pages.forEach( ( p ) => assess( p, budget ) );
			return entry;
		};
		resetFrame();
		ignoreEarlierErrors();
		r.live = { status: 'running', log: run.log };
		r.open = true;
		renderRecipes();

		let status = 'pass';
		/* translators: %s: the warning about a rehearsal from a newer version. */
		if ( newer ) run.log.push( { ok: true, msg: sprintf( __( 'Warning: %s', 'rehearsals' ), newerText( format ) ), ms: 0 } );
		if ( view === 'mobile' || recipe.viewport ) {
			const size = VIEWPORTS[ view ];
			let line;
			if ( view === 'mobile' ) {
				line = recipe.viewport
					? /* translators: 1: width in pixels, 2: height in pixels. */ __( 'Mobile viewport: %1$d × %2$d (this rehearsal is mobile-only)', 'rehearsals' )
					: /* translators: 1: width in pixels, 2: height in pixels. */ __( 'Mobile viewport: %1$d × %2$d', 'rehearsals' );
			} else {
				/* translators: 1: width in pixels, 2: height in pixels. */
				line = __( 'Desktop viewport: %1$d × %2$d (this rehearsal is desktop-only)', 'rehearsals' );
			}
			run.log.push( { ok: true, msg: sprintf( line, size.width, size.height ), ms: 0 } );
		}
		if ( recipe.needs === 'playwright' ) {
			run.log.push( { ok: true, msg: __( 'Needs Playwright, so the browser did not run it. Saved as waiting for the Playwright runner.', 'rehearsals' ), ms: 0 } );
			status = 'queued';
		} else {
			const timeout = recipe.timeout || DEFAULT_TIMEOUT;
			// {{run}} gives each run its own values, so it can find the form, page or response it created.
			const token = Date.now().toString( 36 );
			const steps = JSON.parse( JSON.stringify( recipe.steps ).split( '{{run}}' ).join( token ) );
			if ( JSON.stringify( recipe.steps ).includes( '{{run}}' ) ) {
				run.log.push( { ok: true, msg: `{{run}} = ${ token }`, ms: 0 } );
			}
			// A "role" makes the frame's requests act as that role's test user, until the cookie is cleared below.
			const role = recipe.role && recipe.role !== 'administrator' ? recipe.role : '';
			if ( role ) {
				try {
					const user = await apiFetch( { path: '/rehearsal/v1/role-user', method: 'POST', data: { role } } );
					document.cookie = `rehearsal_role=${ encodeURIComponent( role ) }; path=/; max-age=1800; SameSite=Strict${ window.location.protocol === 'https:' ? '; Secure' : '' }`;
					/* translators: 1: the test user's login, 2: role slug. */
					run.log.push( { ok: true, msg: sprintf( __( 'Running as %1$s (%2$s)', 'rehearsals' ), user.login, role ), ms: 0 } );
				} catch ( e ) {
					/* translators: 1: role slug, 2: error message. */
					run.log.push( { ok: false, msg: sprintf( __( 'Could not prepare the %1$s test user: %2$s', 'rehearsals' ), role, e.message ), ms: 0 } );
					status = 'fail';
				}
			}
			for ( const [ i, step ] of ( status === 'pass' ? steps : [] ).entries() ) {
				/* translators: 1: rehearsal title, 2: number of the step running, 3: how many steps the rehearsal has. */
				document.getElementById( 'rh-frame-step' ).textContent = sprintf( __( '%1$s · step %2$d/%3$d', 'rehearsals' ), title, i + 1, steps.length );
				progressStep( i + 1 );
				const t0 = performance.now();
				try {
					const msg = await exec( run, step, step.timeout || timeout );
					run.log.push( attachPages( { ok: true, msg, ms: Math.round( performance.now() - t0 ) } ) );
				} catch ( e ) {
					const ms = Math.round( performance.now() - t0 );
					if ( step.optional ) {
						/* translators: 1: step number, 2: why it failed. */
						run.log.push( attachPages( { ok: true, msg: sprintf( __( 'Skipped optional step %1$d: %2$s', 'rehearsals' ), i + 1, e.message ), ms } ) );
						renderRecipes();
						continue;
					}
					/* translators: 1: step number, 2: why it failed. */
					run.log.push( attachPages( { ok: false, msg: sprintf( __( 'Step %1$d: %2$s', 'rehearsals' ), i + 1, e.message ), ms } ) );
					status = 'fail';
					break;
				}
				renderRecipes();
				await sleep( STEP_PAUSE );
			}
			if ( run.log.length ) attachPages( run.log[ run.log.length - 1 ] );
			window.__rehearsalDialog = null;
			clearRoleCookie();
		}

		try {
			const saved = await apiFetch( {
				path: '/rehearsal/v1/runs',
				method: 'POST',
				data: { recipe_id: id, recipe_hash: hash, status, log: run.log, snapshots: run.snapshots, errors: run.consoleErrors || [], ref: ref || '', viewport: view },
			} );
			r.lastRun = saved;
			r.live = null;
			r.logCleared = false;
			if ( ! state.runUsers.some( ( u ) => u.id === saved.byId ) ) {
				state.runUsers.push( { id: saved.byId, name: saved.by } );
			}
			if ( hasFilters() ) {
				loadRuns( false );
			} else {
				state.runs.unshift( saved );
				state.runTotal++;
			}
		} catch ( e ) {
			r.live = {
				status: 'unsaved',
				log: run.log,
				errors: run.consoleErrors,
				error: sprintf(
					status === 'pass'
						? /* translators: %s: error message. */ __( 'The run passed but was not saved: %s', 'rehearsals' )
						: /* translators: %s: error message. */ __( 'The run finished but was not saved: %s', 'rehearsals' ),
					e.message || e.code
				),
			};
		}
		renderRecipes();
		renderHistory();
	}

	runButton.addEventListener( 'click', () => runRecipes( state.recipes.filter( ( r ) => r.checked && ! blocked( r ) ) ) );
	runFailedButton.addEventListener( 'click', () => runRecipes( failedRecipes() ) );

	async function runRecipes( picked, ref ) {
		if ( ! picked.length || state.running ) return;
		state.running = true;
		// Tells the plugin which editor loads come from the runner's frame (see no_isolation_in_frame()).
		document.cookie = `rehearsal_frame=1; path=/; max-age=1800; SameSite=Strict${ window.location.protocol === 'https:' ? '; Secure' : '' }`;
		picked.forEach( ( r ) => {
			r.live = null;
			r.logCleared = true;
			r.open = false;
		} );
		renderRecipes();
		startProgress( picked );
		try {
			for ( const [ i, r ] of picked.entries() ) {
				progressAt( i );
				try {
					await runRecipe( r, ref );
				} catch ( e ) {
					// A bug in the runner must fail this rehearsal, not leave the page stuck on "Running…".
					/* translators: %s: error message. */
					r.live = { status: 'unsaved', log: [], error: sprintf( __( 'The runner itself failed: %s', 'rehearsals' ), e.message ) };
				}
			}
		} finally {
			state.running = false;
			clearCookies();
			document.getElementById( 'rh-frame-step' ).textContent = __( 'Done', 'rehearsals' );
			state.runViewport = null;
			fitFrame();
			finishProgress();
			renderRecipes();
		}
	}

	renderRecipes();
	renderFilterOptions();
	renderHistory();

	// A run link (&run=<ids>.<key>&ref=<label>) runs its rehearsals as soon as the screen opens, for agents.
	// The result is on #rh-app as data-run-status (running, pass, fail, queued or error) and data-run-ids.
	async function autorun( { ids, ref, error } ) {
		const line = document.getElementById( 'rh-autorun' );
		const report = ( status, text, runIds = [] ) => {
			root.dataset.runStatus = status;
			root.dataset.runIds = runIds.join( ',' );
			line.hidden = false;
			line.className = `rh-autorun ${ status }`;
			line.innerHTML = text;
		};
		if ( error ) return report( 'error', esc( error ) );
		const picked = ids.map( ( id ) => state.recipes.find( ( r ) => r.id === id ) );
		const unusable = ids.filter( ( id, i ) => ! picked[ i ] || blocked( picked[ i ] ) );
		if ( unusable.length ) {
			return report(
				'error',
				esc(
					sprintf(
						/* translators: %s: comma-separated list of rehearsal IDs. */
						_n( "Run link: rehearsal %s is deleted or can't run on this site, so nothing ran.", "Run link: rehearsals %s are deleted or can't run on this site, so nothing ran.", unusable.length, 'rehearsals' ),
						unusable.join( ', ' )
					)
				)
			);
		}
		const n = picked.length;
		report(
			'running',
			esc(
				ref
					? /* translators: 1: number of rehearsals, 2: the label the runs are saved with. */ sprintf( _n( 'Run link: running %1$d rehearsal (ref %2$s)…', 'Run link: running %1$d rehearsals (ref %2$s)…', n, 'rehearsals' ), n, ref )
					: /* translators: %d: number of rehearsals. */ sprintf( _n( 'Run link: running %d rehearsal…', 'Run link: running %d rehearsals…', n, 'rehearsals' ), n )
			)
		);
		await runRecipes( picked, ref );
		const results = picked.map( ( r ) => ( r.live ? 'error' : r.lastRun.status ) );
		const status = [ 'error', 'fail', 'queued' ].find( ( s ) => results.includes( s ) ) || 'pass';
		const runIds = picked.filter( ( r ) => ! r.live ).map( ( r ) => r.lastRun.id );
		const outcome = {
			/* translators: %d: number of rehearsals. */
			pass: _n( 'Run link: ran %d rehearsal, all passed.', 'Run link: ran %d rehearsals, all passed.', n, 'rehearsals' ),
			/* translators: %d: number of rehearsals. */
			fail: _n( 'Run link: ran %d rehearsal, some failed.', 'Run link: ran %d rehearsals, some failed.', n, 'rehearsals' ),
			/* translators: %d: number of rehearsals. */
			queued: _n( 'Run link: ran %d rehearsal, some need Playwright.', 'Run link: ran %d rehearsals, some need Playwright.', n, 'rehearsals' ),
			/* translators: %d: number of rehearsals. */
			error: _n( 'Run link: ran %d rehearsal, some could not be saved.', 'Run link: ran %d rehearsals, some could not be saved.', n, 'rehearsals' ),
		}[ status ];
		// Each run links to its result in Recent runs.
		const saved =
			runIds.map( ( i ) => `<a href="#run-${ Number( i ) }">${ /* translators: %d: run number. */ esc( sprintf( __( 'run #%d', 'rehearsals' ), Number( i ) ) ) }</a>` ).join( ', ' ) ||
			esc( __( 'nothing', 'rehearsals' ) );
		const savedAs = ref
			? /* translators: 1: links to the saved runs, or "nothing", 2: the label the runs were saved with. */ sprintf( esc( __( 'Saved as %1$s, ref %2$s.', 'rehearsals' ) ), saved, esc( ref ) )
			: /* translators: %s: links to the saved runs, or "nothing". */ sprintf( esc( __( 'Saved as %s.', 'rehearsals' ) ), saved );
		report( status, `${ esc( sprintf( outcome, n ) ) } ${ savedAs }`, runIds );
	}

	showLinkedRun();

	if ( data.autorun ) {
		// Drop &run= so a reload doesn't run it again.
		const url = new URL( window.location.href );
		url.searchParams.delete( 'run' );
		url.searchParams.delete( 'ref' );
		window.history.replaceState( null, '', url );
		autorun( data.autorun );
	}

	if ( data.install ) {
		// Drop ?install= so a reload doesn't prompt again.
		const url = new URL( window.location.href );
		url.searchParams.delete( 'install' );
		window.history.replaceState( null, '', url );
		openInstall( data.install );
	}
} )();
