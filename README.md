mooremachine
============

Short version
-------------

This is a framework for organising your async node.js code as Moore
Finite State Machines. FSMs can be easier to reason about and debug than
implicit state kept in callbacks and objects, leading to more correct code.

License and contributing
------------------------

MPL v2.0

Contributions should be made through Gerrit -- see
[CONTRIBUTING.md](./CONTRIBUTING.md).

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

ThingFSM.prototype.state_stopped = function (S) {
    S.on(this, 'startAsserted', function () {
        S.gotoState('connecting');
    });
};

ThingFSM.prototype.state_connecting = function (S) {
    var self = this;
    this.tf_sock = mod_net.connect(...);
    S.on(this.tf_sock, 'connect', function () {
        S.gotoState('connected');
    });
    S.on(this.tf_sock, 'error', function (err) {
        self.tf_lastError = err;
        S.gotoState('error');
    });
};

ThingFSM.prototype.state_error = function (S) {
    var self = this;
    if (this.tf_sock !== undefined)
        this.tf_sock.destroy();
    this.tf_sock = undefined;
    /* Print an error, do something, check # of retries... */

    /* Retry the connection in 5 seconds */
    S.timeout(5000, function () {
        S.gotoState('connecting');
    });
};

ThingFSM.prototype.state_connected = function (S) {
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

### `FSM#state_name(stateHandle)`

State entry functions. These run exactly once, at entry to the new state. They
should take any actions associated with the state and set up any callbacks that
can cause transition out of it.

The `stateHandle` argument is a handle giving access to functions that should be
used to set up events that can lead to a state transition. It provides
replacements for `EventEmitter#on`, `setTimeout`, and other mechanisms for async
event handling, which are automatically torn down as soon as the FSM leaves its
current state. This prevents erroneous state transitions from a dangling
callback left behind by a previous state.

It is permissible to call `stateHandle.gotoState()` immediately within the
`state_` function.

Caution should be used when emitting events or making synchronous calls within a
`state_` function -- if it is possible for the handler of the event or callee to
call back into the FSM or emit an event itself that may cause the FSM to
transition, then the results of this occurring synchronously within the state
entry function may be undesirable. It is highly recommended to emit any events
within a `setImmediate()` callback.

Parameters:
 - `stateHandle`, an Object, instance of `mod_mooremachine.FSMStateHandle`

### `FSM#allStateEvent(name)`

Adds an "all-state event". Should be called in the constructor for an FSM
subclass. Any registered all-state event must have a handler registered on it
after any state transition. This allows you to enforce that particular events
must be handled in every state of the FSM.

Parameters:
 - `name`: String, name of the event

### `FSM#getState()`

Returns a String, full current state of the FSM (including sub-state).

### `FSM#isInState(state)`

Tests whether the FSM is in the given state, or any sub-state of it.

Parameters:
 - `state`: String, state to test for

Returns a Boolean.

## State handles

### `FSMStateHandle#gotoState(state)`

Transitions the FSM into the given new state. Can only be called once per state
handle.

### `FSMStateHandle#on(emitter, event, cb)`

Works like `EventEmitter#on`: equivalent to `emitter.on(event, cb)` but
registers the callback for removal as soon as the FSM moves out of the current
state.

### `FSMStateHandle#timeout(timeoutMs, cb)`

Equivalent to `setTimeout(cb, timeoutMs)`, but registers the timer for clearing
as soon as the FSM moves out of the current state.

Returns: the timer handle.

### `FSMStateHandle#callback(cb)`

Wraps an arbitrary callback function in such a way that calling it once the FSM
has left the current state is a no-op.

### `FSMStateHandle#interval(intervalMs, cb)`

Equivalent to `setInterval(cb, intervalMs)`, but registers the timer for
clearing as soon as the FSM moves out of the current state.

### `FSMStateHandle#validTransitions(possibleStates)`

Should be called from a state entry function. Sets the list of valid transitions
that are possible out of the current state. Any attempt to transition the FSM
out of the current state to a state not on this list (using `gotoState()`) will
throw an error.

Parameters:
 - `possibleStates`: Array of String, names of valid states

### `FSMStateHandle#gotoState(state)`

Causes the FSM to enter the given new state.

Parameters:
 - `state`: String, state to enter

## Sub-states

It is possible to create a "sub-state" with mooremachine FSMs, which "inherits
from" its parent state. For example:

```js
ThingFSM.prototype.state_connected = function (S) {
    S.on(this.tf_sock, 'close', function () {
        S.gotoState('closed');
    });
    if (workAvailable)
        S.gotoState('connected.busy');
    else
        S.gotoState('connected.idle');
};

ThingFSM.prototype.state_connected.busy = function (S) {
    this.tf_sock.ref();
    /* ... */
    S.on(this.tf_work, 'finished', function () {
        S.gotoState('connected');
    });
};

ThingFSM.prototype.state_connected.idle = function (S) {
    this.tf_sock.unref();
    S.on(this, 'workAvailable', function () {
        S.gotoState('connected.busy');
    });
};
```

All event handlers that are set up in the `'connected'` state entry function are
kept when entering `'connected.busy'` or `'connected.idle'`. When changing from
`'connected.busy'` to `'connected.idle'`, the handlers set up in that sub-state
are torn down, but those originating from `'connected'` are kept.

While in a sub-state of `'connected'`, `fsm.isInState('connected')` will
continue to evaluate to `true`. Separate `'stateChanged'` events will be emitted
for each sub-state entered.

Once a handle is used to transition to an unrelated state (e.g. `'closed'` in
the example), all handlers are torn down (from both the parent state and
sub-state) as usual before entering the new state.
