// Copyright 2015 Joyent, Inc.

module.exports = FSM;

var assert = require('assert-plus');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

/*
 * fsm.js: a small library for Moore finite state machines.
 *
 * A Moore machine takes actions only on entry to a new state (it's an
 * edge-triggered machine). As a result, each valid state of an FSM subclass
 * must have a function named state_X where X is the name of the state, to be
 * run on entry to that state.
 *
 * The state function takes up to 4 arguments -- on, once, timeout and onState.
 * These are used in order to gang together callbacks that result in a state
 * transition out of this state. The "on" and "once" functions act on an
 * EventEmitter, "timeout" is a wrapper around setTimeout, and "onState" allows
 * you to make your FSM transition when another FSM reaches a given state. The
 * idea behind using these is that all callbacks you register in this way will
 * automatically get de-registered (and any timers cleaned up) as soon as the
 * FSM leaves its current state. This way we avoid any stale callbacks from a
 * previous state being called with new data.
 *
 * FSM also supports "sub-states", which share their callbacks with the rest of
 * their family. They are also considered equivalent to the parent state when
 * used with "onState".
 */
function FSM(defState) {
	assert.string(defState, 'default state');
	this.fsm_stListeners = [];
	this.fsm_stTimers = [];
	this.fsm_history = [];
	EventEmitter.call(this);
	this.gotoState(defState);
}
util.inherits(FSM, EventEmitter);

FSM.prototype.getState = function () {
	return (this.fsm_state);
};

FSM.prototype.isInState = function (state) {
	return (this.fsm_state === state ||
	    this.fsm_state.indexOf(state + '.') === 0);
};

/*
 * Calls a callback when this FSM reaches a given state. This is for use by
 * external non-FSM things -- if an FSM wants to listen to another FSM, it
 * should use sOnState (or the onState argument to a state func).
 */
FSM.prototype.onState = function (state, cb) {
	assert.string(state, 'state');
	assert.func(cb, 'callback');
	if (this.fsm_state === state ||
	    this.fsm_state.indexOf(state + '.') === 0) {
		cb();
		return;
	}
	var self = this;
	function stateCb(newState) {
		if (newState !== state &&
		    newState.indexOf(state + '.') !== 0) {
			self.once('stateChanged', stateCb);
			return;
		}
		cb();
	}
	self.once('stateChanged', stateCb);
};

/* Transition the FSM to a new state. */
FSM.prototype.gotoState = function (state) {
	assert.string(state, 'state');

	/*
	 * If we're changing to a state that is not a sub-state of this one,
	 * then kill of all timers and listeners we created in this state.
	 */
	var parts = (this.fsm_state ? this.fsm_state.split('.') : ['']);
	var newParts = state.split('.');
	if (parts[0] !== newParts[0]) {
		var ls = this.fsm_stListeners;
		for (var i = 0; i < ls.length; ++i) {
			ls[i][0].removeListener(ls[i][1], ls[i][2]);
		}
		var ts = this.fsm_stTimers;
		for (i = 0; i < ts.length; ++i) {
			clearTimeout(ts[i]);
		}
		this.fsm_stTimers = [];
		this.fsm_stListeners = [];
	}

	var f = this['state_' + newParts[0]];
	if (typeof (f) !== 'function')
		throw (new Error('Unknown FSM state: ' + state));
	if (newParts[1] !== undefined) {
		f = f[newParts[1]];
		if (typeof (f) !== 'function')
			throw (new Error('Unknown FSM sub-state: ' + state));
	}
	this.fsm_state = state;

	this.fsm_history.push(state);
	if (this.fsm_history.length >= 8)
		this.fsm_history.shift();

	f.call(this, this.sOn.bind(this), this.sOnce.bind(this),
	    this.sTimeout.bind(this), this.sOnState.bind(this));

	this.emit('stateChanged', state);
};

/*
 * These are the per-state event registration functions, which are bound and
 * then passed as the args to state funcs.
 */
FSM.prototype.sOn = function (obj, evt, cb) {
	obj.on(evt, cb);
	this.fsm_stListeners.push([obj, evt, cb]);
};

FSM.prototype.sOnce = function (obj, evt, cb) {
	obj.once(evt, cb);
	this.fsm_stListeners.push([obj, evt, cb]);
};

FSM.prototype.sTimeout = function (timeout, cb) {
	var timer = setTimeout(cb, timeout);
	this.fsm_stTimers.push(timer);
	return (timer);
};

FSM.prototype.sOnState = function (obj, state, cb) {
	assert.string(state, 'state');
	assert.func(cb, 'callback');
	if (obj.fsm_state === state ||
	    obj.fsm_state.indexOf(state + '.') === 0) {
		cb();
		return;
	}
	var self = this;
	function stateCb(newState) {
		if (newState !== state &&
		    newState.indexOf(state + '.') !== 0) {
			self.sOnce(obj, 'stateChanged', stateCb);
			return;
		}
		cb();
	}
	this.sOnce(obj, 'stateChanged', stateCb);
};

/*
 * Wraps a conventional node callback async function up into an EventEmitter so
 * that it can be used as a state transition trigger.
 */
FSM.wrap = function _fsmWrap(fun) {
	function fsm_cb_wrapper() {
		var args = Array.prototype.slice.call(arguments);
		var eve = new EventEmitter();
		var self = this;
		var cb = function () {
			var resArgs = Array.prototype.slice.call(arguments);
			var err = resArgs.shift();
			if (err) {
				eve.emit('error', err);
			} else {
				resArgs.unshift('return');
				eve.emit.apply(eve, resArgs);
			}
		};
		args.push(cb);
		eve.run = function () {
			fun.apply(self, args);
		};
		return (eve);
	}
	return (fsm_cb_wrapper);
};
