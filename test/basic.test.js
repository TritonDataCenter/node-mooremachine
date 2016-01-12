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

test('FSM.wrap', function (t) {
	var fun = function (arg1, cb) {
		setTimeout(function () {
			cb(null, arg1);
		}, 10);
	};
	var wrapped = FSM.wrap(fun);

	var req = wrapped('foobar');
	req.once('error', function (err) {
		t.error(err);
	});
	req.once('return', function (val) {
		t.strictEqual(val, 'foobar');
		t.end();
	});
	req.run();
});

test('FSM.wrap error', function (t) {
	var fun = function (arg1, cb) {
		setTimeout(function () {
			cb(new Error('hi'));
		}, 10);
	};
	var wrapped = FSM.wrap(fun);

	var req = wrapped('foobar');
	req.once('error', function (err) {
		t.ok(err);
		t.strictEqual(err.message, 'hi');
		t.end();
	});
	req.once('return', function (val) {
		t.fail('should not return');
	});
	req.run();
});
