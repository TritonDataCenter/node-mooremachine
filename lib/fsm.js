/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2016, Joyent, Inc.
 */

module.exports = FSM;

var assert = require('assert-plus');
var util = require('util');
var EventEmitter = require('events').EventEmitter;

function FSMStateHandle(fsm, state, link) {
	this.fsh_fsm = fsm;
	this.fsh_link = link;
	this.fsh_state = state;
	this.fsh_valid = true;
	this.fsh_listeners = [];
	this.fsh_timeouts = [];
	this.fsh_intervals = [];
	this.fsh_immediates = [];
	this.fsh_validTransitions = undefined;
	this.fsh_nextState = undefined;
}

FSMStateHandle.prototype.validTransitions = function (states) {
	assert.arrayOfString(states, 'states');
	this.fsh_validTransitions = states;
};

FSMStateHandle.prototype.gotoState = function (state) {
	if (!this.fsh_valid) {
		throw (new Error('FSM attempted to leave state ' +
		    this.fsh_state + ' towards ' + state + ' via a handle ' +
		    'that was already used to enter state ' +
		    this.fsh_nextState));
	}
	if (this.fsh_validTransitions !== undefined) {
		if (this.fsh_validTransitions.indexOf(state) === -1) {
			throw (new Error('Invalid FSM transition: ' +
			    this.fsh_state + ' => ' + state));
		}
	}
	this.fsh_valid = false;
	this.fsh_nextState = state;
	return (this.fsh_fsm._gotoState(state));
};

FSMStateHandle.prototype.disconnect = function () {
	var ls = this.fsh_listeners;
	for (var i = 0; i < ls.length; ++i) {
		ls[i][0].removeListener(ls[i][1], ls[i][2]);
	}
	var ts = this.fsh_timeouts;
	for (i = 0; i < ts.length; ++i) {
		clearTimeout(ts[i]);
	}
	var is = this.fsh_intervals;
	for (i = 0; i < is.length; ++i) {
		clearInterval(is[i]);
	}
	var ims = this.fsh_immediates;
	for (i = 0; i < ims.length; ++i) {
		clearImmediate(ims[i]);
	}
	this.fsh_listeners = [];
	this.fsh_timeouts = [];
	this.fsh_intervals = [];
	this.fsh_immediates = [];
	if (this.fsh_link !== undefined)
		this.fsh_link.disconnect();
};

FSMStateHandle.prototype.on = function (obj, evt, cb) {
	obj.on(evt, cb);
	this.fsh_listeners.push([obj, evt, cb]);
};

FSMStateHandle.prototype.interval = function (interval, cb) {
	var timer = setInterval(cb, interval);
	this.fsh_intervals.push(timer);
	return (timer);
};

FSMStateHandle.prototype.timeout = function (timeout, cb) {
	var timer = setTimeout(cb, timeout);
	this.fsh_timeouts.push(timer);
	return (timer);
};

FSMStateHandle.prototype.immediate = function (cb) {
	var timer = setImmediate(cb);
	this.fsh_immediates.push(timer);
	return (timer);
};

FSMStateHandle.prototype.callback = function (cb) {
	var s = this;
	return (function () {
		var args = arguments;
		if (s.fsh_valid)
			return (cb.apply(this, args));
		return (undefined);
	});
};

/*
 * fsm.js: a small library for Moore finite state machines.
 *
 * A Moore machine takes actions only on entry to a new state (it's an
 * edge-triggered machine). As a result, each valid state of an FSM subclass
 * must have a function named state_X where X is the name of the state, to be
 * run on entry to that state.
 *
 * The state function takes one argument -- the state handle. This is used in
 * order to gang together callbacks that result in a state transition out of
 * this state. The "on" function acts on an EventEmitter, "timeout" is a
 * wrapper around setTimeout. The state handle also contains the "gotoState"
 * method, which is used to transition to a new state. The idea behind using
 * the on/timeout/etc functions is that all callbacks you register in this way
 * will automatically get de-registered (and any timers cleaned up) as soon as
 * the FSM leaves its current state. This way we avoid any stale callbacks
 * from a previous state being called with new data.
 *
 * FSM also supports "sub-states", which share their callbacks with the rest of
 * their family. They are also considered equivalent to the parent state when
 * used with "onState".
 */
function FSM(defState) {
	assert.string(defState, 'default state');
	this.fsm_history = [];
	this.fsm_handle = undefined;
	this.fsm_inTransition = false;
	if (this.fsm_allStateEvents === undefined)
		this.fsm_allStateEvents = [];
	this.fsm_state = undefined;
	this.fsm_toEmit = [];
	EventEmitter.call(this);
	this._gotoState(defState);
}
util.inherits(FSM, EventEmitter);

FSM.prototype.getState = function () {
	return (this.fsm_state);
};

FSM.prototype.isInState = function (state) {
	return (this.fsm_state === state ||
	    this.fsm_state.indexOf(state + '.') === 0);
};

FSM.prototype.allStateEvent = function (evt) {
	assert.string(evt, 'event');
	if (this.fsm_allStateEvents === undefined)
		this.fsm_allStateEvents = [];
	this.fsm_allStateEvents.push(evt);
};

/* Transition the FSM to a new state. */
FSM.prototype._gotoState = function (state) {
	assert.string(state, 'state');

	if (this.fsm_inTransition) {
		assert.ok(this.fsm_nextState === undefined);
		this.fsm_nextState = state;
		return;
	}

	/*
	 * If we're changing to a state that is not a sub-state of this one,
	 * then kill of all timers and listeners we created in this state.
	 */
	var parts = (this.fsm_state ? this.fsm_state.split('.') : ['']);
	var newParts = state.split('.');
	if (parts[0] !== newParts[0] && this.fsm_handle !== undefined) {
		this.fsm_handle.disconnect();
		this.fsm_handle = undefined;
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

	this.fsm_handle = new FSMStateHandle(this, state, this.fsm_handle);

	this.fsm_history.push(state);
	if (this.fsm_history.length >= 8)
		this.fsm_history.shift();

	this.fsm_inTransition = true;
	f.call(this, this.fsm_handle);
	this.fsm_inTransition = false;

	var self = this;
	this.fsm_allStateEvents.forEach(function (evt) {
		if (self.listeners(evt).length < 1) {
			throw (new Error('FSM consistency error: ' +
			    'state entry function for "' + state + '" did ' +
			    'not add a handler for all-state event "' +
			    evt + '"'));
		}
	});

	this.fsm_toEmit.push(state);
	if (this.fsm_toEmit.length === 1) {
		setImmediate(function () {
			var ss = self.fsm_toEmit;
			self.fsm_toEmit = [];
			ss.forEach(function (s) {
				self.emit('stateChanged', s);
			});
		});
	}

	var next = this.fsm_nextState;
	if (next !== undefined) {
		this.fsm_nextState = undefined;
		this._gotoState(next);
	}
};
