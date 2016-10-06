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

test('validTransitions', function (t) {
	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		S.validTransitions(['next']);
		S.on(this, 'foo', function () {
			S.gotoState('next');
		});
		S.on(this, 'foo2', function () {
			S.gotoState('next2');
		});
	};
	Class.prototype.state_next = function (S) {
		S.validTransitions([]);
	};
	Class.prototype.state_next2 = function (S) {
		S.validTransitions([]);
	};

	var c = new Class();
	var history = [];
	c.on('stateChanged', function (st) {
		history.push(st);
	});
	t.ok(c.isInState('initial'));
	c.emit('foo');
	setImmediate(function () {
		t.ok(c.isInState('next'));
		t.deepEqual(history, ['initial', 'next']);

		var c2 = new Class();
		history = [];
		c2.on('stateChanged', function (st) {
			history.push(st);
		});

		t.throws(function () {
			c2.emit('foo2');
		});

		setImmediate(function () {
			t.ok(c2.isInState('initial'));
			t.deepEqual(history, ['initial']);
			t.end();
		});
	});
});

test('unknown state', function (t) {
	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('next');
		});
		S.on(this, 'bar', function () {
			S.gotoState('initial.bad');
		});
	};

	var c = new Class();
	t.ok(c.isInState('initial'));
	t.throws(function () {
		c.emit('foo');
	});
	c = new Class();
	t.throws(function () {
		c.emit('bar');
	});
	t.end();
});

test('callbacks', function (t) {
	var e = new EventEmitter();

	var Class = function () {
		FSM.call(this, 'initial');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_initial = function (S) {
		e.on('foo', S.callback(function () {
			S.gotoState('next');
		}));
		e.on('foobar', S.callback(function () {
			S.gotoState('next2');
		}));
	};
	Class.prototype.state_next = function (S) {
		S.validTransitions([]);
	};
	Class.prototype.state_next2 = function (S) {
		S.validTransitions([]);
	};

	var c = new Class();
	t.ok(c.isInState('initial'));
	e.emit('foo');
	t.ok(c.isInState('next'));
	e.emit('foobar');
	t.ok(c.isInState('next'));
	t.end();
});

test('timeouts', function (t) {
	var Class = function () {
		FSM.call(this, 's1');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_s1 = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('s2');
		});
		S.timeout(50, function () {
			S.gotoState('s3');
		});
	};
	Class.prototype.state_s2 = function (S) {
		S.timeout(50, function () {
			S.gotoState('s1');
		});
	};
	Class.prototype.state_s3 = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('s1');
		});
	};

	var c = new Class();
	t.ok(c.isInState('s1'));
	c.emit('foo');
	t.ok(c.isInState('s2'));

	setTimeout(function () {
		t.ok(c.isInState('s1'));

		setTimeout(function () {
			t.ok(c.isInState('s3'));
			t.end();
		}, 70);
	}, 70);
});

test('all state events', function (t) {
	var Class = function () {
		this.allStateEvent('foo');
		FSM.call(this, 's1');
	};
	util.inherits(Class, FSM);
	Class.prototype.state_s1 = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('s2');
		});
		S.on(this, 'bar', function () {
			S.gotoState('s3');
		});
	};
	Class.prototype.state_s2 = function (S) {
		S.timeout(50, function () {
			S.gotoState('s1');
		});
	};
	Class.prototype.state_s3 = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('s1');
		});
	};

	var c = new Class();
	t.ok(c.isInState('s1'));
	c.emit('bar');
	t.ok(c.isInState('s3'));
	c.emit('foo');
	t.ok(c.isInState('s1'));
	t.throws(function () {
		c.emit('foo');
	});
	t.end();
});

test('interacting FSMs', function (t) {
	var ClassA = function () {
		this.other = new ClassB(this);
		FSM.call(this, 's1');
	};
	util.inherits(ClassA, FSM);
	ClassA.prototype.state_s1 = function (S) {
		S.on(this, 'foo', function () {
			S.gotoState('s2');
		});
	};
	ClassA.prototype.state_s2 = function (S) {
		S.on(this.other, 'baz', function () {
			S.gotoState('s3');
		});
		this.emit('bar');
	};
	ClassA.prototype.state_s3 = function (S) {
		this.emit('baz');
		S.gotoState('s1');
	};

	var ClassB = function (other) {
		this.other = other;
		FSM.call(this, 's1');
	};
	util.inherits(ClassB, FSM);
	ClassB.prototype.state_s1 = function (S) {
		S.on(this.other, 'bar', function () {
			S.gotoState('s2');
		});
	};
	ClassB.prototype.state_s2 = function (S) {
		S.on(this.other, 'baz', function () {
			S.gotoState('s3');
		});
		this.emit('baz');
	};
	ClassB.prototype.state_s3 = function (S) {
		S.gotoState('s1');
	};

	var a = new ClassA();
	var b = a.other;

	t.ok(a.isInState('s1'));
	t.ok(b.isInState('s1'));

	a.emit('foo');

	t.ok(a.isInState('s1'));
	t.ok(b.isInState('s1'));

	t.deepEqual(a.fsm_history, ['s1', 's2', 's3', 's1']);
	t.deepEqual(b.fsm_history, ['s1', 's2', 's3', 's1']);

	t.end();
});
