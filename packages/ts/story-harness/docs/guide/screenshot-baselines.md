---
title: Screenshot baselines
sidebar:
  order: 2
description: The story-shots command, story parameters, CI, and reading a failed check.
---

`story-shots` compares every story of a built Storybook with a committed PNG, in light and
dark, at zero pixel tolerance.

```sh
story-shots <package dir> [--update] [--include p1,p2] [--exclude p3] [--settle-ms N]
```

| Flag | Meaning |
|---|---|
| (none) | Check: shoot each story and compare it with its baseline. Fails on any difference. |
| `--update` | Write the baselines instead of comparing. Also deletes the baselines of stories that no longer exist, among those the filter covers. |
| `--include p1,p2` | Only stories whose id starts with one of these prefixes. |
| `--exclude p3` | Leave out stories whose id starts with these prefixes. Applied after `--include`. |
| `--settle-ms N` | Wait this long after a story's `play` finishes. Default 1500. |

`<package dir>` must hold the built `storybook-static/`. The baselines live in
`<package dir>/.storybook/baselines/`.

## Why a container

The same page renders slightly differently on macOS and Linux, because fonts are rasterised
differently. A baseline made on a laptop would fail in CI. So `story-shots` always runs the
browser inside one pinned Playwright image, as `linux/amd64`, the platform of most CI runners.
On an Apple silicon Mac, Docker emulates it: slower, but the pixels match CI exactly.

This is also why the check can use zero tolerance. The only slack is a colour distance of
0.02 per pixel, which absorbs antialiasing noise on rounded corners and nothing larger.

## What happens to each story

For each story id and theme, the check:

1. opens `iframe.html?id=<id>&viewMode=story&globals=theme:<theme>` at 1440x900;
2. fixes the clock at 2026-09-28 12:00 UTC and seeds `Math.random`, so relative dates and
   generated data are the same every run;
3. waits for Storybook to say the story (and its `play`) finished, then for fonts, the
   network, and the settle time;
4. fails the story if it threw, if its `play` threw, or if the page reported an error;
5. moves the mouse to the corner, so hover styles never leak into the shot;
6. shoots the viewport and compares it with `<id>--<theme>.png`.

## Per-story settings

Set `parameters.screenshot` on a story, or on its meta to cover every story in the file:

```ts
export const LongList: Story = {
  parameters: {
    screenshot: {
      narrow: true, // also shoot at 1024x720, as <id>--<theme>--narrow.png
      settleMs: 300, // this story needs less waiting
    },
  },
}

export const TenThousandRows: Story = {
  parameters: {
    // Left out of the baselines; the string says why.
    screenshot: { skip: 'perf scene: too slow and too large to shoot' },
  },
}
```

A story id that ends in `-narrow` is shot at the narrow viewport only.

## When a check fails

```text
story-shots: check run of /work/my-button in mcr.microsoft.com/playwright:v1.62.1-noble (linux/amd64)
  1) my-button--primary light
    Error: expect(page).toHaveScreenshot(expected) failed
      1234 pixels (ratio 0.01 of all image pixels) are different.
```

Open `test-results/story-shots/`. Each failed story has a folder with three images:

| File | Shows |
|---|---|
| `…-expected.png` | The committed baseline |
| `…-actual.png` | What the story looks like now |
| `…-diff.png` | The changed pixels, in red |

Then:

- **The change was intended:** run `npm run storybook:baseline` and commit the new PNGs with
  the code change, so a reviewer sees both.
- **It was not:** fix the code, rebuild, and check again.
- **The story failed instead of differing** (`story my-button--primary failed: …`): the story
  or its `play` threw. That is a real bug in the story or the component.

## In CI

The check needs Docker, which GitHub's Ubuntu runners have:

```yaml
- run: npm ci
- run: npm run storybook:build
- run: npm run storybook:check
- uses: actions/upload-artifact@v4
  if: failure()
  with:
    name: story-shots
    path: test-results/story-shots/
```

## Settings

| Variable | Effect |
|---|---|
| `SHOT_WORKERS` | Playwright workers in the container. Default 6. Most of each test is waiting, so more workers than cores is fine. |
| `STORY_SHOTS_PLATFORM` | The container platform. Default `linux/amd64`. Changing it changes the pixels. |

## On macOS

Docker needs a Linux VM. With Colima, start it with Rosetta so the amd64 image runs fast, and
give it about 6 GB for six workers:

```sh
colima start --vm-type vz --vz-rosetta --cpu 4 --memory 6
npm run storybook:check
```

On a smaller VM, run `SHOT_WORKERS=3 npm run storybook:check`.

## Upgrading the package

A new version of this package can pin a newer Playwright image, which can move pixels. That
is always released as a minor version, and its changelog says so. After such an upgrade, run
`storybook:baseline` once and commit the result as its own change.
