# Git mechanics

The git model the protocol rests on. Skip this if you know refs and `--force-with-lease`.

## What is a ref?

A named pointer to a git object, usually a commit. A branch is a ref under `refs/heads/`, a tag one
under `refs/tags/`. A lease is a ref under a namespace of your own, such as
`refs/locks/build-cache`. Git hosts do not list such refs as branches.

## Where does the payload live?

In the tree of the commit the lease ref points at:

```text
refs/locks/build-cache
  -> commit abc123
      -> tree
          -> lease.json    (the payload, canonical JSON)
          -> notes.md      (any extra files you add)
```

Each lease has its own ref and its own commit. It is not one shared ref holding many lease files.

## What does compare-and-swap mean here?

> Move this ref to `NEW` only if it still points to `OLD`.

That is what stops two workers from both believing they renewed or took the same lease. git's
encoding is `--force-with-lease=<ref>:<expected>`:

- a create: empty expected value (`<ref>:`), "must not exist";
- a replace: `<ref>:<old>`, "must still point here";
- a delete: `<ref>:<old>` with an empty source, deletes only if still at `<old>`.

When the authority's value does not match, the push fails and the worker fetches and decides
again.

## Does a lease have history?

Yes, while its ref exists. Each write is a new commit, usually with the previous one as its parent,
and the ref moves to it:

```text
refs/locks/build-cache
  -> C3  lease.json state=released
     parent C2  lease.json state=renewed
     parent C1  lease.json state=held
```

To keep the history after a lease ends, create a ref under an archive namespace at the last commit
before deleting the active ref.

## How much load does it add?

Each write is one small blob, one tree, one commit and one ref update: hundreds of bytes to a few
KB. What matters is how often you write. Ten leases renewed three times an hour each is about thirty
commits an hour.

## Local authority or hosted?

The data model is the same. A bare repository on disk and a hosted remote hold the same refs and
commits and support the same five operations. The difference is who can see them: a local bare
repository coordinates only the workers on that machine (or on machines that mount it with correct
locking), a hosted remote every worker with access.
