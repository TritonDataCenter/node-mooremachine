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

This lets you define sequential actions with asynchronous functions. However,
if you need more complex logic within this structure, this becomes rapidly 
limiting -- it is difficult, for example, to create a loop. You have to improvise one by nesting some form of loop within a `series` call and a second
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

todo

