mooremachine
============

Introduction
-----------

It's widely known that if you want to sequence some series of asynchronous
actions in node, you should use a library like `vasync` or `async` to do so --
they let you define a series of callbacks to be run in order, like this:

```js
async.series([
    function (cb) { thing.once('something', cb) },
    function (cb) { anotherthing.get(key, function () { cb(null, blah); }); }
]);
```

This lets you define sequential actions with asynchronous functions. However, if
you need more complex logic within this structure, this becomes rapidly
limiting -- it is difficult, for example, to create a loop. You have to
improvise one by nesting some form of loop within a `series` call and a second
layer of callbacks.

Another problem comes if you want to define multiple ways to return from one of
these functions in the async series -- e.g. if there is an error and result
path that are separate:

```js
    function (cb) {
        thing.once('error', cb);
        thing.once('success', function (result) { cb(null, result); });
    }
```

While one such additional path is manageable, things quickly become very
complex.

Instead, let us think of each of the callbacks in such an async sequence as
being states of a finite state machine. With `async.series` we are limited to
defining only edges that progress forwards through the list. If, instead, we
could define whatever edges we like, we could construct conditional logic and
loops across async boundaries. If we had some way to "gang" the callbacks set
up in each state together, they could all be disconnected at state exit and
avoid the need for complex logic to deal with out-of-state events.

This library provides a framework for dealing with just such an async finite
state machine.

### Moore machines

A Moore machine (as opposed to a Mealy machine) is an FSM whose outputs depend
solely on the present state, and not any other inputs. They are considered
to be a simpler approach than the Mealy machine, and easier to reason about.

In our analogy, of course, our state machine does not have distinct outputs
(since really we are using it to run arbitrary code). If we consider the FSM's
"outputs" as the total set of side-effects it has on the program's state,
however, we can interpret a Moore machine as being an FSM where code only runs
on the entry to a new state, and all other events can only serve to cause
state transitions.

Example
-------

In this example we'll create an FSM called `ThingFSM`. It's a typical network
client, which wants to make a TCP connection to something and talk to it. It
also wants to delay/backoff and retry on failure.

```js
var mod_mooremachine = require('mooremachine');
var mod_util = require('util');
var mod_net = require('net');

function ThingFSM() {
    this.tf_sock = undefined;
    this.tf_lastError = undefined;
    mod_mooremachine.FSM.call(this, 'stopped');
}
mod_util.inherits(ThingFSM, mod_mooremachine.FSM);

ThingFSM.prototype.state_stopped = function (on) {
    var self = this;
    on(this, 'startAsserted', function () {
        self.gotoState('connecting');
    });
};

ThingFSM.prototype.state_connecting = function (on) {
    var self = this;
    this.tf_sock = mod_net.connect(...);
    on(this.tf_sock, 'connect', function () {
        self.gotoState('connected');
    });
    on(this.tf_sock, 'error', function (err) {
        self.tf_lastError = err;
        self.gotoState('error');
    });
};

ThingFSM.prototype.state_error = function (on, once, timeout) {
    var self = this;
    if (this.tf_sock !== undefined)
        this.tf_sock.destroy();
    this.tf_sock = undefined;
    /* Print an error, do something, check # of retries... */

    /* Retry the connection in 5 seconds */
    timeout(5000, function () {
        self.gotoState('connecting');
    });
};

ThingFSM.prototype.state_connected = function (on) {
    /* ... */
};
```

API
---

### Inheriting from FSM

Implementations of a state machine should inherit from `mod_mooremachine.FSM`,
using `mod_util.inherits`. The only compulsory methods that the subprototype
must implement are the state callbacks.

### `mod_mooremachine.FSM(initialState)`

Constructor. Must be called by the constructor of the subprototype.

Parameters:
 - `initialState`: String, name of the initial state the FSM will enter at
   startup

### `mod_mooremachine#state_name(on, once, timeout, onState)`

State entry functions. These run exactly once, at entry to the new state. They
should take any actions associated with the state and set up any callbacks that
can cause transition out of it.

The `on`, `once`, `timeout` and `onState` arguments are functions that should be
used to set up events that can lead to a state transition. The `on` function is
like `EventEmitter#on`, but any handlers set up with it will be automatically
torn down as soon as the FSM leaves its current state. Similar for `once` and
`timeout`. The `onState` function is used in place of calling
`mod_mooremachine#onState` on another FSM.

Parameters:
 - `on`: Function `(emitter, event, cb)`, sets up an event callback like
   `EventEmitter#on`. Parameters:
   - `emitter`: an EventEmitter
   - `event`: a String, name of the event
   - `cb`: a Function, callback to run when the event happens
 - `once`: Function `(emitter, event, cb)`, like `on` but only runs once
 - `timeout`: Function `(timeout, cb)`, like `setTimeout()`. Parameters:
   - `timeout`: Number, milliseconds until the callback runs
   - `cb`: a Function, callback to run
 - `onState`: Function `(fsm, state, cb)`

### `mod_mooremachine#getState()`

Returns a String, full current state of the FSM (including sub-state).

### `mod_mooremachine#isInState(state)`

Tests whether the FSM is in the given state, or any sub-state of it.

Parameters:
 - `state`: String, state to test for

Returns a Boolean.

### `mod_mooremachine#onState(state, cb)`

Runs a callback on the next time that the FSM enters a given state or any
sub-state of it.

Parameters:
 - `state`: String, state to test for
 - `cb`: Function `(newState)`

### `mod_mooremachine#gotoState(state)`

Causes the FSM to enter the given new state.

Parameters:
 - `state`: String, state to enter

### `mod_mooremachine.FSM.wrap(fun)`

Wraps a conventional node callback function up into an EventEmitter, to make
life a little easier with `on()`.

Parameters:
 - `fun`: Function `(cb)`
