# Use Hermes Chat UI on your phone

[Back to the README](../README.md) · [Try the workflow](demo.md)

First verify a working conversation on the Docker host. Keep the host running
when you leave home; the PWA is a client, not an offline Hermes runtime.

## Reach the UI over HTTPS

Service workers and push need a secure browser context. The localhost exception
on your computer does not apply to `http://192.168.x.x:8643` on your phone.
Use an HTTPS hostname with a certificate your phone trusts.
See the [Service Worker API requirements](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API).

### Tailscale Serve on the Docker host

This route assumes Tailscale is installed on the **host operating system** where
Docker publishes `127.0.0.1:8643`, and on your phone, signed into the same tailnet.
An isolated Tailscale container cannot use that host loopback address directly.
See [Tailscale installation](https://tailscale.com/download).

Keep `UI_BIND_ADDRESS=127.0.0.1` in `.env`. On the Docker host:

```bash
tailscale serve status
tailscale serve --bg http://127.0.0.1:8643
```

If Serve already exposes another application at the default HTTPS root, choose
a separate supported HTTPS port or a separate host instead of replacing it.
Follow any link Tailscale presents to enable HTTPS, then open the **HTTPS URL
printed by Serve** on your phone with Tailscale connected. If you changed
`PROXY_PORT`, use that port instead of `8643`.

Serve restricts reachability to your tailnet and its access rules. It does not
add application accounts: only allow your trusted devices/users to reach this
service. Do not use public Funnel exposure for this unauthenticated UI. The
background Serve configuration persists across host restarts; see
[Tailscale Serve documentation](https://tailscale.com/docs/reference/tailscale-cli/serve).

### Existing authenticated reverse proxy

You can instead serve the UI at the **root of a dedicated HTTPS hostname** behind
your existing authentication layer. Forward to host port `8643`, or to
`http://hermes-chat-ui:8643` when the proxy container shares the Docker network.
`127.0.0.1` inside another container does not refer to the UI.

Proxy the whole UI origin, including `/api/*`, `/v1/capabilities`, `/sw.js`, and
the web manifest. Disable response buffering for streamed chat and allow long
responses. Authenticate before granting access to the UI APIs; protecting only
the HTML page is insufficient. Install the PWA from this final hostname so its
permissions, service worker, and push subscription use the same origin.

## Install and enable notifications

### iPhone and iPad

Use iOS/iPadOS 16.4 or later. Open the HTTPS URL in Safari, use **Share → Add to
Home Screen**, and launch the app from its new icon. In the app's settings,
enable push notifications and allow the system prompt. The exact share-menu
placement can vary by OS version. WebKit documents push support for
[Home Screen web apps](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/).

### Android

Open the HTTPS URL in a browser supporting PWA installation and Web Push, such
as Chrome. Use its **Install app / Add to Home screen** option if available,
open the installed app, then enable push in its settings and allow the browser's
permission prompt. Menu labels and notification controls vary by browser.

### Check delivery

Send a task that takes enough time to finish after you background the app. Hide
or close **every other Hermes Chat UI window**, including desktop windows, before
the response finishes. The server intentionally suppresses completion push while
any client is visible. Then tap the notification and verify the same conversation
opens. Follow the [demo walkthrough](demo.md) for a repeatable trial.

Completion push does not require `HERMES_PUSH_API_KEY` or dashboard credentials;
those are for optional proactive automation. Keys and subscriptions for ordinary
push are stored automatically in the UI `/app/data` volume.

## If something does not work

| Symptom                                           | Check                                                                                                                     |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| App cannot open away from home                    | Host is on, Tailscale is connected on both devices, and access rules allow the HTTPS service                              |
| Notifications unsupported                         | Trusted HTTPS origin, supported browser, and on iOS launch from the Home Screen                                           |
| Notifications blocked                             | Change the site's/app's OS notification permission; toggling inside the UI cannot override a denial                       |
| No notification after a task                      | All UI windows were hidden before completion; Focus/Do Not Disturb is off; UI server can reach the browser's push service |
| No notification after force-closing a visible app | Its last visibility report may remain active for up to 45 seconds; try backgrounding normally before a longer task        |
| Notification arrives but app will not load        | Delivery uses the OS push service; opening the private conversation still requires your VPN connection                    |
| Subscription stopped working after migration      | Keep the UI data volume and final HTTPS origin stable; if keys/origin changed, disable and enable push again              |

Push delivery depends on browser/OS services and connectivity; it is not a
guaranteed alert channel. Payloads include a short answer preview, which may
appear on your lock screen. The UI is self-hosted, but Web Push is not an entirely
local transport.

Browser suspension/reconnection is different from a server restart. Completed
messages are read from Hermes and retained images from the UI volume. Active
stream state lives in server memory, so restarting the UI or Hermes during a
task can interrupt it. Check the saved conversation before resending work.
