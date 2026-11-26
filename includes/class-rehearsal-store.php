<?php
/**
 * Rehearsal: Rehearsal posts: registering, saving, and shaping them for the runner.
 *
 * @package rehearsals
 */

defined( 'ABSPATH' ) || exit;

/**
 * Rehearsal posts: registering, saving, and shaping them for the runner.
 */
final class Rehearsal_Store {
	/**
	 * Both post types are admin-only: a recipe acts as whoever runs it.
	 */
	public static function register_types() {
		$admin_caps = array_fill_keys(
			array( 'edit_posts', 'edit_others_posts', 'edit_published_posts', 'edit_private_posts', 'publish_posts', 'read_private_posts', 'delete_posts', 'delete_others_posts', 'delete_published_posts', 'delete_private_posts', 'create_posts' ),
			'manage_options'
		);

		// Recipes are edited in the Rehearsal dialog, so the post type has no screens of its own.
		register_post_type(
			Rehearsal::RECIPE,
			array(
				'label'        => __( 'Rehearsals', 'rehearsals' ),
				'public'       => false,
				'show_ui'      => false,
				'map_meta_cap' => true,
				'capabilities' => $admin_caps,
			)
		);

		register_post_type(
			Rehearsal::RUN,
			array(
				'label'        => __( 'Rehearsal runs', 'rehearsals' ),
				'public'       => false,
				'show_ui'      => false,
				'map_meta_cap' => true,
				'capabilities' => array_merge( $admin_caps, array( 'create_posts' => 'do_not_allow' ) ),
			)
		);
	}

	/**
	 * Recipes plus their latest run, for the runner.
	 *
	 * @return array
	 */
	public static function recipes_for_js() {
		$posts = get_posts(
			array(
				'post_type'      => Rehearsal::RECIPE,
				'post_status'    => 'publish',
				'posts_per_page' => 100,
				'orderby'        => 'title',
				'order'          => 'ASC',
			)
		);
		return array_values( array_filter( array_map( array( __CLASS__, 'recipe_for_js' ), $posts ) ) );
	}

	/**
	 * One recipe as the runner sees it, or null when its stored steps are unusable.
	 *
	 * @param WP_Post $post Recipe post.
	 * @return array|null
	 */
	public static function recipe_for_js( $post ) {
		$recipe = json_decode( $post->post_content, true );
		if ( Rehearsal_Schema::validate( $recipe ) ) {
			return null;
		}
		return array(
			'id'       => $post->ID,
			// The raw title: get_the_title() texturizes it into HTML entities, and every place that shows it escapes it.
			'title'    => $post->post_title,
			'hash'     => Rehearsal_Schema::hash( $post->post_content ),
			'recipe'   => $recipe,
			'shareUrl' => Rehearsal_Share::share_url( $post->ID ),
			'source'   => (string) get_post_meta( $post->ID, '_rehearsal_source', true ),
			'missing'  => Rehearsal_Requirements::missing_requirements( $recipe ),
			'format'   => Rehearsal_Schema::format_of( $recipe ),
			'newer'    => Rehearsal_Schema::is_newer( $recipe ),
			'runUrl'   => Rehearsal_Share::run_url( array( $post->ID ) ),
			'lastRun'  => Rehearsal_Runs::latest( $post->ID ),
		);
	}

	/**
	 * A rehearsal with this title and these steps, so saving the same one twice doesn't make a copy.
	 *
	 * @param string $title  Title.
	 * @param array  $recipe Validated rehearsal.
	 * @return int Its ID, or 0.
	 */
	public static function find_same( $title, array $recipe ) {
		$hash = Rehearsal_Schema::hash( Rehearsal_Schema::canonical( $recipe ) );
		$same = get_posts(
			array(
				'post_type'      => Rehearsal::RECIPE,
				'post_status'    => 'publish',
				'title'          => $title,
				'posts_per_page' => 20,
			)
		);
		foreach ( $same as $post ) {
			if ( Rehearsal_Schema::hash( $post->post_content ) === $hash ) {
				return $post->ID;
			}
		}
		return 0;
	}

	/**
	 * Validate and save a rehearsal, as REST and the abilities do. Saving the same title and steps again,
	 * as a retrying agent does, returns the rehearsal already saved instead of a copy.
	 *
	 * @param int    $id     Rehearsal to update, or 0 to add one.
	 * @param string $title  Title.
	 * @param mixed  $recipe Rehearsal definition ({ "steps": [ … ] }), not yet validated.
	 * @return array|WP_Error The saved rehearsal as recipe_for_js() shapes it, plus "existing".
	 */
	public static function save( $id, $title, $recipe ) {
		$id = (int) $id;
		if ( $id && Rehearsal::RECIPE !== get_post_type( $id ) ) {
			return new WP_Error( 'rehearsal_no_recipe', __( 'That rehearsal does not exist.', 'rehearsals' ), array( 'status' => 404 ) );
		}
		$error = Rehearsal_Schema::validate( $recipe );
		$title = trim( sanitize_text_field( (string) $title ) );
		if ( $error || '' === $title ) {
			return new WP_Error( 'rehearsal_invalid', $error ? $error : __( 'Give the rehearsal a title.', 'rehearsals' ), array( 'status' => 400 ) );
		}
		$same = $id ? 0 : self::find_same( $title, $recipe );
		if ( $same ) {
			return self::recipe_for_js( get_post( $same ) ) + array( 'existing' => true );
		}
		$id = self::save_recipe( $id, $title, $recipe );
		return is_wp_error( $id ) ? $id : self::recipe_for_js( get_post( $id ) ) + array( 'existing' => false );
	}

	/**
	 * Create or update a recipe. Content is written after insert so no content filter (kses) can alter it.
	 *
	 * @param int    $id     Recipe ID, or 0 to create.
	 * @param string $title  Title.
	 * @param array  $recipe Validated recipe.
	 * @param string $source Share URL it was installed from, if any.
	 * @return int|WP_Error Recipe ID.
	 */
	public static function save_recipe( $id, $title, array $recipe, $source = '' ) {
		global $wpdb;
		$recipe = Rehearsal_Schema::with_format( $recipe );
		$post = array(
			'post_type'   => Rehearsal::RECIPE,
			'post_status' => 'publish',
			'post_title'  => $title,
		);
		$id   = $id ? wp_update_post( $post + array( 'ID' => $id ), true ) : wp_insert_post( $post, true );
		if ( is_wp_error( $id ) ) {
			return $id;
		}
		$wpdb->update( $wpdb->posts, array( 'post_content' => Rehearsal_Schema::canonical( $recipe ) ), array( 'ID' => $id ) ); // phpcs:ignore WordPress.DB.DirectDatabaseQuery
		clean_post_cache( $id );
		if ( $source ) {
			update_post_meta( $id, '_rehearsal_source', $source );
		}
		return $id;
	}
}
