// Copyright 2015 Joyent, Inc.

var FSM = require('../lib/fsm');
var test = require('tape').test;
var util = require('util');
var EventEmitter = require('events').EventEmitter;

test('enters initial state', function (t) {
	var inited;

	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		t.strictEqual(typeof (S.on), 'function');
		t.strictEqual(typeof (S.timeout), 'function');
		t.strictEqual(typeof (S.gotoState), 'function');
		inited = true;
	};

	var c = new Class();
	t.ok(inited);
	t.strictEqual(c.getState(), 'initial');
	t.end();
});

test('S.on works, emits stateChanged', function (t) {
	var e = new EventEmitter();

	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		S.on(e, 'foo', function () {
			S.gotoState('notnext');
		});
		S.immediate(function () {
			S.gotoState('next');
		});
	};
	Class.prototype.state_next = function (S) {
		S.validTransitions([]);
	};

	var c = new Class();
	var history = [];
	c.on('stateChanged', function (st) {
		history.push(st);
	});
	t.ok(c.isInState('initial'));
	t.strictEqual(e.listeners('foo').length, 1);
	setImmediate(function () {
		t.ok(c.isInState('next'));
		t.strictEqual(e.listeners('foo').length, 0);
		t.deepEqual(history, ['initial', 'next']);
		t.end();
	});
});

test('double transition', function (t) {
	var e = new EventEmitter();

	var err;

	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		e.on('foo', function () {
			try {
				S.gotoState('next');
			} catch (ex) {
				err = ex;
			}
		});
	};
	Class.prototype.state_next = function (S) {
		S.validTransitions([]);
	};

	var c = new Class();
	var history = [];
	c.on('stateChanged', function (st) {
		history.push(st);
	});
	t.ok(c.isInState('initial'));
	t.strictEqual(e.listeners('foo').length, 1);
	setImmediate(function () {
		t.ok(c.isInState('initial'));
		e.emit('foo');
		e.emit('foo');
		setImmediate(function () {
			t.ok(c.isInState('next'));
			t.strictEqual(e.listeners('foo').length, 1);
			t.deepEqual(history, ['initial', 'next']);
			t.ok(err);
			t.ok(err.message.match(/already used/i));
			t.end();
		});
	});
});
