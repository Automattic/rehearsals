<?php
/**
 * Which sites get Rehearsal's abilities.
 *
 * @package rehearsals
 */

use PHPUnit\Framework\TestCase;

final class AbilitiesTest extends TestCase {

	/**
	 * @dataProvider versions
	 */
	public function test_abilities_need_wordpress_7_1_and_the_api( $version, $has_api, $expected ) {
		$this->assertSame( $expected, Rehearsal_Abilities::available( $version, $has_api ) );
	}

	public function versions() {
		return array(
			'7.1'                   => array( '7.1', true, true ),
			'7.1.5'                 => array( '7.1.5', true, true ),
			'7.2'                   => array( '7.2', true, true ),
			'8.0'                   => array( '8.0', true, true ),
			'7.0.3'                 => array( '7.0.3', true, false ),
			'6.9, which has the API' => array( '6.9', true, false ),
			'7.1 beta'              => array( '7.1-beta1', true, false ),
			'7.1 without the API'   => array( '7.1', false, false ),
		);
	}
}
