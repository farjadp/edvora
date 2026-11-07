/* Edvora Migrator admin: batch loop over admin-ajax. No external dependencies. */
( function () {
	'use strict';

	var cfg = window.EdvoraMigrator;
	if ( ! cfg ) {
		return;
	}

	function $( id ) {
		return document.getElementById( id );
	}

	function post( action, extra ) {
		var body = new window.FormData();
		body.append( 'action', 'edvora_migrator_' + action );
		body.append( 'nonce', cfg.nonce );
		Object.keys( extra || {} ).forEach( function ( k ) {
			body.append( k, extra[ k ] );
		} );
		return window
			.fetch( cfg.ajaxUrl, { method: 'POST', credentials: 'same-origin', body: body } )
			.then( function ( r ) {
				return r.json();
			} )
			.then( function ( json ) {
				if ( ! json || ! json.success ) {
					throw new Error( ( json && json.data && json.data.message ) || cfg.i18n.failed );
				}
				return json.data;
			} );
	}

	function setBusy( busy ) {
		[ 'edvora-push', 'edvora-push-restart', 'edvora-bundle', 'edvora-ping' ].forEach( function ( id ) {
			if ( $( id ) ) {
				$( id ).disabled = busy;
			}
		} );
	}

	function show( p, label ) {
		var box = document.querySelector( '.edvora-progress' );
		box.hidden = false;
		var pct = p.total > 0 ? Math.min( 100, Math.round( ( p.sent / p.total ) * 100 ) ) : ( p.done ? 100 : 0 );
		$( 'edvora-progress-bar' ).value = pct;
		$( 'edvora-progress-text' ).textContent =
			label + ' ' + p.sent.toLocaleString() + ' / ' + p.total.toLocaleString() + ( p.kind ? ' — ' + p.kind : '' );
	}

	function fail( err ) {
		setBusy( false );
		document.querySelector( '.edvora-progress' ).hidden = false;
		$( 'edvora-progress-text' ).textContent = cfg.i18n.failed + ' ' + err.message;
	}

	function loop( stepAction, label, onDone ) {
		return post( stepAction ).then( function ( p ) {
			show( p, label );
			if ( p.done ) {
				return onDone( p );
			}
			return loop( stepAction, label, onDone );
		} );
	}

	function push( resume ) {
		setBusy( true );
		$( 'edvora-progress-text' ).textContent = cfg.i18n.preparing;
		post( 'push_start', { resume: resume ? '1' : '' } )
			.then( function ( p ) {
				show( p, cfg.i18n.sending );
				return loop( 'push_step', cfg.i18n.sending, function () {
					setBusy( false );
					$( 'edvora-progress-text' ).textContent = cfg.i18n.done;
				} );
			} )
			.catch( fail );
	}

	if ( $( 'edvora-ping' ) ) {
		$( 'edvora-ping' ).addEventListener( 'click', function () {
			var out = $( 'edvora-ping-result' );
			out.textContent = cfg.i18n.preparing;
			post( 'ping' )
				.then( function ( d ) {
					out.textContent = cfg.i18n.connected + ' ' + d.tenant + ( d.status ? ' (' + d.status + ')' : '' );
					if ( $( 'edvora_tenant' ) && d.tenant ) {
						$( 'edvora_tenant' ).value = d.tenant;
					}
				} )
				.catch( function ( e ) {
					out.textContent = e.message;
				} );
		} );
	}

	if ( $( 'edvora-push' ) ) {
		$( 'edvora-push' ).addEventListener( 'click', function () {
			push( true );
		} );
	}
	if ( $( 'edvora-push-restart' ) ) {
		$( 'edvora-push-restart' ).addEventListener( 'click', function () {
			push( false );
		} );
	}

	if ( $( 'edvora-bundle' ) ) {
		$( 'edvora-bundle' ).addEventListener( 'click', function () {
			setBusy( true );
			post( 'bundle_start' )
				.then( function ( p ) {
					show( p, cfg.i18n.building );
					return loop( 'bundle_step', cfg.i18n.building, function () {
						setBusy( false );
						$( 'edvora-progress-text' ).textContent = cfg.i18n.ready;
						window.location.href = cfg.downloadUrl;
					} );
				} )
				.catch( fail );
		} );
	}
} )();
