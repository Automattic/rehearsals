#!/usr/bin/env node
/**
 * Opens a Rehearsal run link in headless Chromium, waits for the result, and prints it as JSON.
 *
 *   node run-link.cjs "<run link>" [--ref=<label>] [--timeout=<seconds>]
 *
 * Logs in with one of:
 *   STORAGE_STATE=auth.json            a saved Playwright session of an administrator
 *   WP_USER=… WP_PASS=…                an administrator's login, typed into wp-login.php
 *
 * Exit code: 0 pass, 1 fail, 2 anything else (error, queued, timeout, not logged in).
 * Needs the `playwright` (or `@playwright/test`) package and its Chromium:
 *   npm i -D playwright && npx playwright install chromium
 */
const path = require( 'path' );

function loadPlaywright() {
	const roots = [ process.cwd(), __dirname ];
	for ( const name of [ 'playwright', '@playwright/test' ] ) {
		for ( const root of roots ) {
			try {
				return require( require.resolve( name, { paths: [ root ] } ) );
			} catch ( e ) {}
		}
	}
	console.error( 'Playwright is not installed here. Run: npm i -D playwright && npx playwright install chromium' );
	process.exit( 2 );
}

const args = process.argv.slice( 2 );
const link = args.find( ( a ) => ! a.startsWith( '--' ) );
const opt = ( name, fallback ) => {
	const hit = args.find( ( a ) => a.startsWith( `--${ name }=` ) );
	return hit ? hit.slice( name.length + 3 ) : fallback;
};
if ( ! link || ! /[?&]run=/.test( link ) ) {
	console.error( 'Usage: node run-link.cjs "<runUrl from `wp rehearsal list --format=json`>" [--ref=<label>] [--timeout=<seconds>]' );
	process.exit( 2 );
}

const url = new URL( link );
const ref = opt( 'ref', '' );
if ( ref ) url.searchParams.set( 'ref', ref );
const timeout = Number( opt( 'timeout', 600 ) ) * 1000;

( async () => {
	const { chromium } = loadPlaywright();
	const browser = await chromium.launch();
	const context = await browser.newContext( {
		viewport: { width: 1600, height: 1000 },
		storageState: process.env.STORAGE_STATE ? path.resolve( process.env.STORAGE_STATE ) : undefined,
	} );
	const page = await context.newPage();
	const finish = async ( result, code ) => {
		console.log( JSON.stringify( result ) );
		await browser.close();
		process.exit( code );
	};

	if ( ! process.env.STORAGE_STATE && process.env.WP_USER ) {
		await page.goto( new URL( '/wp-login.php', url ).href );
		await page.fill( '#user_login', process.env.WP_USER );
		await page.fill( '#user_pass', process.env.WP_PASS || '' );
		await Promise.all( [ page.waitForNavigation(), page.click( '#wp-submit' ) ] );
	}

	await page.goto( url.href );
	if ( ! ( await page.$( '#rh-app' ) ) ) {
		return finish( { status: 'error', message: `No Rehearsal screen at ${ page.url() }. Not logged in as an administrator, or the plugin is not active.` }, 2 );
	}
	try {
		await page.waitForFunction(
			() => [ 'pass', 'fail', 'queued', 'error' ].includes( document.querySelector( '#rh-app' ).dataset.runStatus ),
			null,
			{ timeout }
		);
	} catch ( e ) {
		return finish( { status: 'timeout', message: `No result after ${ timeout / 1000 } s.` }, 2 );
	}
	const result = await page.$eval( '#rh-app', ( el ) => ( {
		status: el.dataset.runStatus,
		runIds: el.dataset.runIds ? el.dataset.runIds.split( ',' ).map( Number ) : [],
		message: ( document.getElementById( 'rh-autorun' ) || {} ).innerText || '',
	} ) );
	finish( { ...result, ref: ref || url.searchParams.get( 'ref' ) || '' }, { pass: 0, fail: 1 }[ result.status ] ?? 2 );
} )().catch( ( e ) => {
	console.log( JSON.stringify( { status: 'error', message: e.message } ) );
	process.exit( 2 );
} );
