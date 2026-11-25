<?php
/**
 * Plugin Name: Rehearsal
 * Plugin URI: https://github.com/Automattic/rehearsals
 * Description: Repeatable, shareable step-by-step checks of your site, run in the browser from Tools → Rehearsal.
 * Version: 0.21.0
 * Author: Automattic
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package rehearsals
 */

defined( 'ABSPATH' ) || exit;

/**
 * Start Rehearsal, unless the copy that ships with the Jurassic Ninja Companion plugin already did.
 *
 * Both copies register the same post types, screen, REST routes and CLI command, so only one may run.
 * Checking on plugins_loaded sees Companion's copy whichever plugin WordPress loaded first.
 */
function rehearsals_boot() {
	if ( class_exists( 'Companion_Rehearsal' ) ) {
		add_filter(
			'plugin_row_meta',
			function ( $meta, $file ) {
				if ( plugin_basename( __FILE__ ) === $file ) {
					$meta[] = esc_html__( 'Inactive: the Companion plugin\'s copy of Rehearsal is running on this site.', 'rehearsals' );
				}
				return $meta;
			},
			10,
			2
		);
		return;
	}

	require_once __DIR__ . '/class-rehearsal.php';
	Rehearsal::init();
}
add_action( 'plugins_loaded', 'rehearsals_boot', 0 );
