<?php
/**
 * Tests for Rehearsal_Examples.
 *
 * @package rehearsals
 */

use PHPUnit\Framework\TestCase;

/**
 * The examples are saved without going through the dialog's validation.
 */
class ExamplesTest extends TestCase {

	public function test_every_example_is_valid() {
		foreach ( Rehearsal_Examples::all( true, true ) as $title => $rehearsal ) {
			$this->assertSame( '', Rehearsal_Schema::validate( $rehearsal ), $title );
		}
	}

	public function test_jetpack_examples_only_where_jetpack_can_run_them() {
		$titles = array_keys( Rehearsal_Examples::all( false, false ) );

		$this->assertNotContains( 'My Jetpack renders', $titles );
		$this->assertContains( 'Rehearsal: its own screen works', $titles );
	}
}
