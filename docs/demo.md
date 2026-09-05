# Try the main workflow

[Back to the README](../README.md) · [Phone setup](mobile.md)

This walkthrough demonstrates the product on your own installation. It is not
a recorded demonstration or a claim that every device combination has been tested.
You need a configured Hermes model, the installed PWA, and working notification
permissions. Model requests use your configured provider and may incur usage costs.

## From a task to a notification

1. Open the PWA on your phone and start a new conversation. Try this prompt:

   > Write a detailed, practical checklist for documenting a home server:
   > services, data locations, backups, restore procedures, and update steps.
   > Use only general knowledge. Do not run tools or modify any files.

2. As the answer streams, put the app in the background and lock your phone.
   Hide any other open UI windows too. If the answer finishes too quickly, use
   a longer task you actually need and repeat.
3. When the completion notification arrives, tap it. Verify that it opens the
   conversation you started and that the complete answer is visible.
4. Open the UI at the same HTTPS address on your computer. Find that conversation
   and continue it with: "Condense this into five priorities."
5. Refresh after the response completes and verify both turns remain visible.

Do not restart the containers during this trial: that tests interruption
recovery, which has different guarantees from leaving the browser.

## Check shared history and images

- Start a harmless conversation in your existing Hermes CLI or official dashboard.
  Refresh the UI and confirm it appears in the session list. Both clients must
  point to the same Hermes instance/profile data.
- With an image-capable model, attach a non-sensitive image to a new UI message.
  After completion, refresh and reopen the image. The UI data volume retains it.

## A short recording to share

Record the phone flow above using non-sensitive content. Show the task being
sent, the app going into the background, the real notification, and the resumed
conversation. If you cut out waiting time, label the cut. State the device/OS,
UI image version, Hermes version, and access method used. Avoid filming keys,
private conversations, server addresses, or unrelated notifications.

## Feedback after first use

For an initial trial with five users, record the following with their consent.
No analytics service or automatic collection is required:

| Question                                               | What to record                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------- |
| Could you install using only the guide?                | Time to first reply and each step requiring help                 |
| Did the phone workflow finish?                         | OS/browser, successful notification, correct conversation opened |
| When did you choose this UI over your previous client? | A specific task or situation                                     |
| Did you use it again in the following two weeks?       | Approximate days used and reasons for returning or stopping      |
| What was the biggest difficulty?                       | One issue, in the user's own words                               |

If sharing feedback in a [GitHub issue](https://github.com/lukegskw/hermes-chat-ui/issues),
include versions and reproduction steps rather than private chat contents or
credentials. A useful first milestone is three people returning weekly without
the maintainer operating their installation for them; it is an exploratory
target, not a market benchmark.
