// Copyright 2015 Joyent, Inc.

var FSM = require('../lib/fsm');
var test = require('tape').test;
var util = require('util');

test('enters initial state', function (t) {
	var inited;

	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (on, once, timeout, onState) {
		t.strictEqual(typeof (on), 'function');
		t.strictEqual(typeof (once), 'function');
		t.strictEqual(typeof (timeout), 'function');
		t.strictEqual(typeof (onState), 'function');
		inited = true;
	};

	var c = new Class();
	t.ok(inited);
	t.strictEqual(c.getState(), 'initial');
	t.end();
});
