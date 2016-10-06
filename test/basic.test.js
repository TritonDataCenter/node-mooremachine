/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/*
 * Copyright (c) 2016, Joyent, Inc.
 */

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

test('substates', function (t) {
	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('next');
		});
		S.on(this, 'bar', function () {
			S.gotoState('initial.sub1');
		});
	};
	Class.prototype.state_initial.sub1 = function (S) {
		S.on(this, 'foobar', function () {
			S.gotoState('initial.sub2');
		});
	};
	Class.prototype.state_initial.sub2 = function (S) {
		S.on(this, 'baz', function () {
			S.gotoState('initial.sub1');
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
	t.ok(!c.isInState('initial.sub1'));
	t.ok(!c.isInState('initial.sub2'));
	c.emit('bar');
	t.ok(c.isInState('initial.sub1'));
	t.strictEqual(c.listeners('foobar').length, 1);
	t.strictEqual(c.listeners('foo').length, 1);
	c.emit('foobar');
	t.ok(c.isInState('initial.sub2'));
	t.strictEqual(c.listeners('foobar').length, 0);
	c.emit('foobar');
	t.ok(c.isInState('initial.sub2'));
	c.emit('baz');
	t.ok(c.isInState('initial.sub1'));
	c.emit('foobar');
	c.emit('bar');
	t.ok(c.isInState('initial.sub1'));
	c.emit('foo');
	t.ok(c.isInState('next'));

	setImmediate(function () {
		t.deepEqual(history, ['initial', 'initial.sub1',
		    'initial.sub2', 'initial.sub1', 'initial.sub2',
		    'initial.sub1', 'next']);
		t.end();
	});
});

/*
 * Note that re-entry into the same state is legal, but discouraged. We keep
 * the test here to verify that it works in the basic case, but making
 * heavy use of it is usually a sign of a poorly considered state model.
 */
test('re-entry into same state', function (t) {
	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('initial');
		});
	};

	var c = new Class();
	var history = [];
	c.on('stateChanged', function (st) {
		history.push(st);
	});
	t.ok(c.isInState('initial'));
	c.emit('foo');
	t.ok(c.isInState('initial'));
	setImmediate(function () {
		t.deepEqual(history, ['initial', 'initial']);
		t.end();
	});
});

test('re-entry to parent state', function (t) {
	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('initial.sub1');
		});
	};
	Class.prototype.state_initial.sub1 = function (S) {
		S.on(this, 'bar', function () {
			S.gotoState('initial');
		});
	};

	var c = new Class();
	var history = [];
	c.on('stateChanged', function (st) {
		history.push(st);
	});
	t.ok(c.isInState('initial'));
	c.emit('foo');
	c.emit('bar');
	c.emit('foo');
	c.emit('foo');
	c.emit('bar');
	t.ok(c.isInState('initial'));
	t.strictEqual(c.listeners('foo').length, 1);
	t.strictEqual(c.listeners('bar').length, 0);

	setImmediate(function () {
		t.deepEqual(history, ['initial', 'initial.sub1', 'initial',
		    'initial.sub1', 'initial.sub1', 'initial']);
		t.end();
	});
});

test('too many dots in state name', function (t) {
	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('initial.foo.bar');
		});
	};

	var c = new Class();
	t.ok(c.isInState('initial'));
	t.throws(function () {
		c.emit('foo');
	});
	t.end();
});
