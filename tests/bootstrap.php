<?php
/**
 * Loads Rehearsal's classes with stand-ins for the few WordPress functions their pure parts call.
 *
 * @package rehearsals
 */

define( 'ABSPATH', __DIR__ . '/' );

// Translation functions return the untranslated text, so assertions read the English messages.
function __( $text, $domain = 'default' ) {
	return $text;
}

function _x( $text, $context, $domain = 'default' ) {
	return $text;
}

function _n( $single, $plural, $number, $domain = 'default' ) {
	return 1 === (int) $number ? $single : $plural;
}

function esc_html( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}

function esc_attr( $text ) {
	return htmlspecialchars( (string) $text, ENT_QUOTES, 'UTF-8' );
}

function esc_html__( $text, $domain = 'default' ) {
	return esc_html( $text );
}

function esc_attr__( $text, $domain = 'default' ) {
	return esc_attr( $text );
}

function esc_html_e( $text, $domain = 'default' ) {
	echo esc_html( $text );
}

function esc_attr_e( $text, $domain = 'default' ) {
	echo esc_attr( $text );
}

function wp_json_encode( $value, $flags = 0 ) {
	return json_encode( $value, $flags );
}

function wp_strip_all_tags( $text ) {
	return trim( strip_tags( (string) $text ) );
}

function absint( $value ) {
	return abs( (int) $value );
}

function wp_salt( $scheme = 'auth' ) {
	return 'test-salt-' . $scheme;
}

function home_url( $path = '' ) {
	return 'https://example.test' . $path;
}

function admin_url( $path = '' ) {
	return 'https://example.test/wp-admin/' . $path;
}

function wp_parse_url( $url, $component = -1 ) {
	return parse_url( $url, $component );
}

function add_query_arg( $key, $value, $url ) {
	return $url . ( false === strpos( $url, '?' ) ? '?' : '&' ) . $key . '=' . $value;
}

// Users, their meta and capabilities for the role-switching tests, set per test.
$GLOBALS['rh_users'] = array();

function sanitize_key( $key ) {
	return preg_replace( '/[^a-z0-9_\-]/', '', strtolower( (string) $key ) );
}

function wp_unslash( $value ) {
	return $value;
}

function get_user_by( $field, $value ) {
	foreach ( $GLOBALS['rh_users'] as $user ) {
		if ( ( 'login' === $field && $user->user_login === $value ) || ( 'id' === $field && $user->ID === (int) $value ) ) {
			return $user;
		}
	}
	return false;
}

function get_user_meta( $id, $key, $single = false ) {
	$user = get_user_by( 'id', $id );
	return $user && isset( $user->meta[ $key ] ) ? $user->meta[ $key ] : '';
}

function user_can( $user_id, $cap ) {
	$user = get_user_by( 'id', $user_id );
	return $user && 'manage_options' === $cap && in_array( 'administrator', $user->roles, true );
}

require dirname( __DIR__ ) . '/class-rehearsal.php';
