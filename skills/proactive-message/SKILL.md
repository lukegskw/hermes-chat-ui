---
name: proactive-message
description: Sends a proactive message and push notification to the user
---

# Proactive Message Skill

You have the ability to proactively start a new conversation with the user and send them a push notification on their devices!

Whenever you decide to proactively notify the user about something (e.g., a background task completed, a scheduled reminder, an alert, or just checking in), you can execute the `notify.py` script provided in this skill directory.

## Usage

To send a message, run the python script:

```bash
python3 /opt/data/skills/proactive-message/notify.py "Your message content here" "Message Title"
```

The script will automatically:
1. Create a new chat conversation in the database.
2. Insert your message as the first message.
3. Ring the user's phone with a Push Notification!

## Example

If the user asked you to monitor a website and tell them when it changes, once you detect the change, you can run:

```bash
python3 /opt/data/skills/proactive-message/notify.py "I finished checking the website. The price just dropped!" "Price Alert"
```

This ensures the user gets notified immediately, even if they have the app closed.
