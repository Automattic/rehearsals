<?php
/**
 * Rehearsal: abilities, so agents can use Rehearsal through the Abilities API and MCP.
 *
 * @package rehearsals
 */

defined( 'ABSPATH' ) || exit;

/**
 * Registers Rehearsal's abilities on WordPress 7.1 and later. They do what `wp rehearsal` does: list,
 * read, save and install rehearsals, read runs, and make run links and PR-description blocks.
 *
 * Running a rehearsal still needs a logged-in browser: an agent opens the run link these return, then
 * reads the result with rehearsals/find-runs.
 */
final class Rehearsal_Abilities {
	const CATEGORY = 'rehearsals';

	/**
	 * The oldest WordPress these abilities register on.
	 */
	const MIN_WP = '7.1';

	/**
	 * Whether this site gets the abilities: the Abilities API exists and WordPress is 7.1 or later.
	 *
	 * @param string $wp_version WordPress version.
	 * @param bool   $has_api    Whether the Abilities API functions exist.
	 * @return bool
	 */
	public static function available( $wp_version, $has_api ) {
		return $has_api && version_compare( $wp_version, self::MIN_WP, '>=' );
	}

	/**
	 * Hook up registration, on sites that get the abilities.
	 */
	public static function init() {
		$has_api = function_exists( 'wp_register_ability' ) && function_exists( 'wp_register_ability_category' );
		if ( ! self::available( get_bloginfo( 'version' ), $has_api ) ) {
			return;
		}
		add_action( 'wp_abilities_api_categories_init', array( __CLASS__, 'register_category' ) );
		add_action( 'wp_abilities_api_init', array( __CLASS__, 'register' ) );
	}

	/**
	 * The ability category.
	 */
	public static function register_category() {
		wp_register_ability_category(
			self::CATEGORY,
			array(
				'label'       => __( 'Rehearsals', 'rehearsals' ),
				'description' => __( 'Repeatable, shareable browser checks of this site, and their saved runs.', 'rehearsals' ),
			)
		);
	}

	/**
	 * Only administrators can see, edit or run rehearsals, as on the screen.
	 *
	 * @return bool
	 */
	public static function can_manage() {
		return current_user_can( 'manage_options' );
	}

	/**
	 * Register every ability.
	 */
	public static function register() {
		$id_schema = array(
			'type'        => 'integer',
			'minimum'     => 1,
			'description' => __( 'The rehearsal\'s ID, as rehearsals/list-rehearsals returns it.', 'rehearsals' ),
		);
		$rehearsal = array(
			'type'        => 'object',
			'description' => __( 'A saved rehearsal: its ID, title, steps, share link, run link and latest run.', 'rehearsals' ),
		);

		self::add(
			'list-rehearsals',
			array(
				'label'         => __( 'List rehearsals', 'rehearsals' ),
				'description'   => __( 'Lists the rehearsals saved on this site, with each one\'s ID, title, step count, latest result, whether it can run here, share link and run link.', 'rehearsals' ),
				'output_schema' => array(
					'type'  => 'array',
					'items' => array(
						'type'       => 'object',
						'properties' => array(
							'id'         => array( 'type' => 'integer' ),
							'title'      => array( 'type' => 'string' ),
							'rehearsal'  => array( 'type' => 'string' ),
							'steps'      => array( 'type' => 'integer' ),
							'lastResult' => array( 'type' => 'string' ),
							'canRun'     => array( 'type' => 'boolean' ),
							'missing'    => array(
								'type'  => 'array',
								'items' => array( 'type' => 'string' ),
							),
							'shareUrl'   => array( 'type' => 'string' ),
							'runUrl'     => array( 'type' => 'string' ),
						),
					),
				),
				'execute'       => array( __CLASS__, 'list_rehearsals' ),
			),
			array( 'readonly' => true )
		);

		self::add(
			'get-rehearsal',
			array(
				'label'         => __( 'Get a rehearsal', 'rehearsals' ),
				'description'   => __( 'Returns one rehearsal with its steps and settings, share link, run link and latest run.', 'rehearsals' ),
				'input_schema'  => array(
					'type'                 => 'object',
					'properties'           => array( 'id' => $id_schema ),
					'required'             => array( 'id' ),
					'additionalProperties' => false,
				),
				'output_schema' => $rehearsal,
				'execute'       => array( __CLASS__, 'get_rehearsal' ),
			),
			array( 'readonly' => true )
		);

		self::add(
			'save-rehearsal',
			array(
				'label'         => __( 'Save a rehearsal', 'rehearsals' ),
				'description'   => __( 'Validates and saves a rehearsal: a list of browser steps such as { "goto": "/wp-admin/" }, { "click": "#submit" } and { "expect": "h1", "toHaveText": "Settings" }. Returns it with its ID and run link. Saving the same title and steps again returns the one already saved. Pass an id to update a rehearsal. A validation error says which step is wrong.', 'rehearsals' ),
				'input_schema'  => array(
					'type'                 => 'object',
					'properties'           => array(
						'title'     => array(
							'type'        => 'string',
							'minLength'   => 1,
							'description' => __( 'What the rehearsal checks. Say "(changes …)" when its steps change the site.', 'rehearsals' ),
						),
						'rehearsal' => array(
							'type'        => 'object',
							'description' => __( 'The rehearsal: { "steps": [ … ] } plus optional settings such as "requires", "role" or "viewport".', 'rehearsals' ),
							'properties'  => array(
								'steps' => array(
									'type'     => 'array',
									'minItems' => 1,
									'items'    => array( 'type' => 'object' ),
								),
							),
							'required'    => array( 'steps' ),
						),
						'id'        => array_merge( $id_schema, array( 'description' => __( 'Update this rehearsal instead of adding one.', 'rehearsals' ) ) ),
					),
					'required'             => array( 'title', 'rehearsal' ),
					'additionalProperties' => false,
				),
				'output_schema' => $rehearsal,
				'execute'       => array( __CLASS__, 'save_rehearsal' ),
			),
			array(
				'readonly'    => false,
				'destructive' => false,
				'idempotent'  => true,
			)
		);

		self::add(
			'install-rehearsal',
			array(
				'label'         => __( 'Install a shared rehearsal', 'rehearsals' ),
				'description'   => __( 'Installs a rehearsal from a share link (https://site/?rehearsal=…) another site made. Installing the same link again updates that copy. Returns its ID and what this site is missing to run it.', 'rehearsals' ),
				'input_schema'  => array(
					'type'                 => 'object',
					'properties'           => array(
						'url' => array(
							'type'        => 'string',
							'format'      => 'uri',
							'description' => __( 'The share link.', 'rehearsals' ),
						),
					),
					'required'             => array( 'url' ),
					'additionalProperties' => false,
				),
				'output_schema' => array(
					'type'       => 'object',
					'properties' => array(
						'id'      => array( 'type' => 'integer' ),
						'title'   => array( 'type' => 'string' ),
						'updated' => array( 'type' => 'boolean' ),
						'missing' => array(
							'type'  => 'array',
							'items' => array( 'type' => 'string' ),
						),
						'newer'   => array( 'type' => 'boolean' ),
						'runUrl'  => array( 'type' => 'string' ),
					),
				),
				'execute'       => array( __CLASS__, 'install_rehearsal' ),
			),
			array(
				'readonly'    => false,
				'destructive' => false,
				'idempotent'  => true,
			)
		);

		self::add(
			'get-run-link',
			array(
				'label'         => __( 'Get a run link', 'rehearsals' ),
				'description'   => __( 'Returns a link that runs these rehearsals as soon as an administrator\'s browser opens it, and saves each result with the ref label. Read the results afterwards with rehearsals/find-runs and that ref. Keep run links private to the site\'s administrators.', 'rehearsals' ),
				'input_schema'  => array(
					'type'                 => 'object',
					'properties'           => array(
						'ids' => array(
							'type'     => 'array',
							'minItems' => 1,
							'items'    => $id_schema,
						),
						'ref' => array(
							'type'        => 'string',
							'pattern'     => Rehearsal_Runs::REF_PATTERN,
							'description' => __( 'A label saved with each run, such as a task or PR number, to find the runs again.', 'rehearsals' ),
						),
					),
					'required'             => array( 'ids' ),
					'additionalProperties' => false,
				),
				'output_schema' => array(
					'type'       => 'object',
					'properties' => array( 'url' => array( 'type' => 'string' ) ),
				),
				'execute'       => array( __CLASS__, 'get_run_link' ),
			),
			array( 'readonly' => true )
		);

		self::add(
			'find-runs',
			array(
				'label'         => __( 'Find runs', 'rehearsals' ),
				'description'   => __( 'Lists saved runs, newest first, 25 to a page: each run\'s number, rehearsal, result, the step-by-step log (what each step waited for and what the page showed instead) and script errors.', 'rehearsals' ),
				'input_schema'  => array(
					'type'                 => 'object',
					'properties'           => array(
						'rehearsal' => array_merge( $id_schema, array( 'description' => __( 'Only runs of this rehearsal.', 'rehearsals' ) ) ),
						'ref'       => array(
							'type'        => 'string',
							'pattern'     => Rehearsal_Runs::REF_PATTERN,
							'description' => __( 'Only runs saved with this ref label.', 'rehearsals' ),
						),
						'status'    => array(
							'type' => 'string',
							'enum' => array( 'pass', 'fail', 'queued' ),
						),
						'page'      => array(
							'type'    => 'integer',
							'minimum' => 1,
							'default' => 1,
						),
					),
					'additionalProperties' => false,
				),
				'output_schema' => array(
					'type'       => 'object',
					'properties' => array(
						'runs'  => array(
							'type'  => 'array',
							'items' => array( 'type' => 'object' ),
						),
						'total' => array( 'type' => 'integer' ),
						'pages' => array( 'type' => 'integer' ),
					),
				),
				'execute'       => array( __CLASS__, 'find_runs' ),
			),
			array( 'readonly' => true )
		);

		self::add(
			'get-report',
			array(
				'label'         => __( 'Get a PR report', 'rehearsals' ),
				'description'   => __( 'Returns a Markdown block for a pull request description: the rehearsal, its latest result, links to install or export it, and its steps folded away.', 'rehearsals' ),
				'input_schema'  => array(
					'type'                 => 'object',
					'properties'           => array( 'id' => $id_schema ),
					'required'             => array( 'id' ),
					'additionalProperties' => false,
				),
				'output_schema' => array(
					'type'       => 'object',
					'properties' => array( 'markdown' => array( 'type' => 'string' ) ),
				),
				'execute'       => array( __CLASS__, 'get_report' ),
			),
			array( 'readonly' => true )
		);
	}

	/**
	 * Register one ability in the category, for administrators, exposed to REST and MCP.
	 *
	 * @param string $name        Name after "rehearsals/".
	 * @param array  $args        label, description, input_schema, output_schema and execute.
	 * @param array  $annotations readonly, destructive and idempotent hints.
	 */
	private static function add( $name, array $args, array $annotations ) {
		$ability = array(
			'label'               => $args['label'],
			'description'         => $args['description'],
			'category'            => self::CATEGORY,
			'execute_callback'    => $args['execute'],
			'permission_callback' => array( __CLASS__, 'can_manage' ),
			'output_schema'       => $args['output_schema'],
			'meta'                => array(
				'public'      => true,
				'annotations' => $annotations,
			),
		);
		if ( isset( $args['input_schema'] ) ) {
			$ability['input_schema'] = $args['input_schema'];
		}
		wp_register_ability( self::CATEGORY . '/' . $name, $ability );
	}

	/**
	 * A rehearsal post, or an error naming the ID.
	 *
	 * @param mixed $id Rehearsal ID.
	 * @return WP_Post|WP_Error
	 */
	private static function rehearsal_post( $id ) {
		$post = get_post( (int) $id );
		if ( ! $post || Rehearsal::RECIPE !== $post->post_type || 'publish' !== $post->post_status ) {
			return new WP_Error( 'rehearsal_no_recipe', __( 'That rehearsal does not exist.', 'rehearsals' ), array( 'status' => 404 ) );
		}
		return $post;
	}

	/**
	 * Execute rehearsals/list-rehearsals.
	 *
	 * @return array
	 */
	public static function list_rehearsals() {
		return array_map(
			static function ( $r ) {
				$last = $r['lastRun'];
				return array(
					'id'         => $r['id'],
					'title'      => $r['title'],
					'rehearsal'  => substr( $r['hash'], 0, 7 ),
					'steps'      => count( $r['recipe']['steps'] ),
					'lastResult' => ! $last ? 'not run' : ( $last['hash'] === $r['hash'] ? $last['status'] : 'stale' ),
					'canRun'     => ! $r['missing'],
					'missing'    => array_values( wp_list_pluck( $r['missing'], 'name' ) ),
					'shareUrl'   => $r['shareUrl'],
					'runUrl'     => $r['runUrl'],
				);
			},
			Rehearsal_Store::recipes_for_js()
		);
	}

	/**
	 * Execute rehearsals/get-rehearsal.
	 *
	 * @param array $input Input.
	 * @return array|WP_Error
	 */
	public static function get_rehearsal( $input ) {
		$post = self::rehearsal_post( $input['id'] ?? 0 );
		return is_wp_error( $post ) ? $post : Rehearsal_Store::recipe_for_js( $post );
	}

	/**
	 * Execute rehearsals/save-rehearsal.
	 *
	 * @param array $input Input.
	 * @return array|WP_Error
	 */
	public static function save_rehearsal( $input ) {
		return Rehearsal_Store::save( $input['id'] ?? 0, $input['title'] ?? '', $input['rehearsal'] ?? null );
	}

	/**
	 * Execute rehearsals/install-rehearsal: read the link, then install exactly what was read.
	 *
	 * @param array $input Input.
	 * @return array|WP_Error
	 */
	public static function install_rehearsal( $input ) {
		$url     = (string) ( $input['url'] ?? '' );
		$preview = Rehearsal_Rest::install( $url, true, '' );
		if ( is_wp_error( $preview ) ) {
			return $preview;
		}
		$saved = Rehearsal_Rest::install( $url, false, $preview['id'] );
		if ( is_wp_error( $saved ) ) {
			return $saved;
		}
		return array(
			'id'      => (int) $saved['id'],
			'title'   => $preview['title'],
			'updated' => (bool) $saved['updated'],
			'missing' => array_values( wp_list_pluck( $preview['missing'], 'name' ) ),
			'newer'   => (bool) $preview['newer'],
			'runUrl'  => Rehearsal_Share::run_url( array( (int) $saved['id'] ) ),
		);
	}

	/**
	 * Execute rehearsals/get-run-link.
	 *
	 * @param array $input Input.
	 * @return array|WP_Error
	 */
	public static function get_run_link( $input ) {
		$ids = array_values( array_unique( array_map( 'intval', (array) ( $input['ids'] ?? array() ) ) ) );
		foreach ( $ids as $id ) {
			$post = self::rehearsal_post( $id );
			if ( is_wp_error( $post ) ) {
				return $post;
			}
		}
		return array( 'url' => Rehearsal_Share::run_url( $ids, (string) ( $input['ref'] ?? '' ) ) );
	}

	/**
	 * Execute rehearsals/find-runs.
	 *
	 * @param array|null $input Input.
	 * @return array
	 */
	public static function find_runs( $input = null ) {
		$input = (array) $input;
		return Rehearsal_Runs::find_runs(
			array(
				'recipe' => (int) ( $input['rehearsal'] ?? 0 ),
				'status' => (string) ( $input['status'] ?? '' ),
				'ref'    => (string) ( $input['ref'] ?? '' ),
				'page'   => (int) ( $input['page'] ?? 1 ),
			)
		);
	}

	/**
	 * Execute rehearsals/get-report.
	 *
	 * @param array $input Input.
	 * @return array|WP_Error
	 */
	public static function get_report( $input ) {
		$post = self::rehearsal_post( $input['id'] ?? 0 );
		if ( is_wp_error( $post ) ) {
			return $post;
		}
		return array( 'markdown' => Rehearsal_Share::to_github( Rehearsal_Share::share_payload( $post ), Rehearsal_Runs::latest( $post->ID ) ) );
	}
}
