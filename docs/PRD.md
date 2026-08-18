# Thailand Trip Brain — Reel Ingestion MVP

## 1. Product Overview

We are building a lightweight product for a Thailand bachelor trip.

The group already discovers restaurants, clubs, activities, beaches, travel tips, hidden spots, and other recommendations by sharing Instagram Reels in an existing Instagram group chat.

The first version of the product should create a reliable knowledge base from those reels **without changing how anyone currently uses Instagram**.

The core experience should be:

> Someone shares a Reel in the existing Instagram group → the Reel is automatically captured by Trip Brain → useful information from that Reel becomes available for future use.

The primary goal of this MVP is **data collection**, not trip planning.

Once the data is available reliably, additional features can be built on top of it later.

---

## 2. Problem Statement

Today, useful information shared in the Instagram group becomes difficult to retrieve.

Typical problems:

- Someone remembers seeing a great Bangkok club but cannot find the Reel again.
- Multiple people share dozens of Reels over several weeks.
- Recommendations get buried under conversations and newer Reels.
- The same place may appear in multiple Reels.
- Valuable information exists inside the Reel's audio, caption, and visuals, not just the link.
- Going back through hundreds of group messages during the trip is impractical.

We want to convert the group's passive Reel-sharing behavior into a persistent source of trip knowledge.

---

## 3. Product Principle

### Zero additional friction

The product must not require the group to adopt a new sharing behavior.

The expected user flow is:

```text
See interesting Reel
        ↓
Share it to the existing Thailand group
        ↓
Done
```

Users should not normally have to:

- Copy the Reel URL.
- Open another application.
- Forward the Reel somewhere else.
- Tag a bot.
- Use a command.
- Add hashtags.
- Fill out a form.
- Describe why the Reel is useful.
- Categorize the Reel manually.

If normal sharing inside the group is not enough to trigger ingestion, the core product experience has failed.

---

## 4. MVP Objective

The MVP should automatically capture Instagram Reels shared in the bachelor-trip group and preserve enough information from each Reel that future products can use the data.

The product should create a reliable repository of:

- Which Reels were shared.
- Who shared them.
- When they were shared.
- The original Reel.
- Information communicated by the Reel.
- Information contained in the Reel caption.
- Information spoken in the Reel.
- Important text visible within the Reel.

The emphasis is on **capturing the source knowledge accurately and reliably**.

---

## 5. Primary User Story

### Reel ingestion

**As a member of the Thailand bachelor-trip group,**

I want to share Instagram Reels exactly as I already do,

so that interesting information is automatically added to our shared Trip Brain without me doing anything extra.

---

## 6. Core Product Requirements

### 6.1 Automatic detection

When a new Instagram Reel is shared in the designated bachelor-trip group, the system should automatically recognize that a Reel has been shared.

No additional user action should be required.

---

### 6.2 Automatic ingestion

Once a Reel is detected, it should automatically be added to Trip Brain.

The system should preserve a link back to the original Reel whenever possible.

---

### 6.3 Preserve source information

For every ingested Reel, Trip Brain should preserve the basic source context, including where possible:

- Original Reel.
- Reel creator.
- Person in the bachelor group who shared it.
- Time it was shared.
- Reel caption.

This source information should remain available even after additional processing is added later.

---

### 6.4 Capture the knowledge inside the Reel

A Reel is more than just a URL.

The system should attempt to preserve the useful information contained within it, including:

- Spoken information.
- Caption information.
- Important text displayed on screen.
- Names of places or experiences mentioned.
- Prices mentioned.
- Tips or recommendations mentioned.
- Warnings or restrictions mentioned.
- Other relevant information communicated by the Reel.

For the MVP, the system does **not** need to perfectly structure all of this information into categories.

The priority is to make sure the original knowledge is not lost.

---

### 6.5 Do not over-interpret the Reel

The ingestion layer should distinguish between:

1. Information actually present in the Reel.
2. Information inferred or generated later.

For example:

If a Reel says:

> "This rooftop bar has an amazing sunset view."

Trip Brain can preserve that statement.

It should not automatically turn it into:

> "This is the best rooftop bar in Bangkok."

unless the Reel actually communicates that.

The ingestion system should favor faithful capture over creative interpretation.

---

### 6.6 Duplicate Reels

The same Reel may be shared multiple times.

Trip Brain should avoid unnecessarily processing the exact same Reel repeatedly.

However, the fact that multiple people shared the same Reel should not be lost.

For example:

```text
Yona Beach Club Reel

Shared by:
- Himanshu
- Rahul
- Aditya
```

This may become useful information later.

---

### 6.7 Historical context

A Reel should remain part of the knowledge base even if:

- The original Instagram message becomes difficult to locate.
- Hundreds of newer messages are added to the group.
- Other people share the same Reel.
- Future product features change how Reel information is interpreted.

The purpose of ingestion is to create a durable trip dataset.

---

### 6.8 Failed ingestion

Some Reels may occasionally fail to process.

A temporary failure should not cause the Reel to disappear permanently.

The product should make it possible to identify that:

- A Reel was detected.
- Processing failed.
- The Reel still needs to be processed.

The experience should favor **eventual capture rather than silent loss**.

---

### 6.9 Minimal manual fallback

There may be exceptional situations where automatic ingestion misses a Reel.

A simple manual fallback may exist so the owner of the product can add a missed Reel.

This is strictly a fallback mechanism.

It should not become the expected user behavior for the group.

---

## 7. What Should Be Stored From a Product Perspective

Every Reel should conceptually have three layers of information.

### Layer 1 — Source

What was originally shared.

Examples:

- Original Reel.
- Reel creator.
- Person who shared it.
- Share timestamp.

### Layer 2 — Captured content

What the Reel actually communicates.

Examples:

- Caption.
- Spoken content.
- Visible text.
- Useful information contained within the Reel.

### Layer 3 — Derived information

Information produced later by other product features.

Examples:

- City.
- Category.
- Restaurant.
- Club.
- Beach.
- Activity.
- Estimated budget.
- Coordinates.
- Recommendation score.
- Suggested itinerary.

**Layer 3 is not required for this MVP.**

The MVP should make Layers 1 and 2 reliable so that Layer 3 can be built later by anyone.

---

## 8. Example

A friend shares a Reel titled:

> "5 insane things to do in Phuket"

The Reel mentions:

- Yona Beach Club.
- Bangla Road.
- Phi Phi Island boat party.
- Old Phuket Town.
- A sunset viewpoint.

For the ingestion MVP, success means Trip Brain preserves:

- The original Reel.
- Who shared it.
- When it was shared.
- The Reel caption.
- The information spoken in the Reel.
- Important names/text displayed in the Reel.

It is **not necessary yet** to create five separate Phuket activity cards.

That can be built later from the captured data.

---

## 9. User Experience Expectations

The bachelor group should ideally forget that Trip Brain exists.

People should continue sharing Reels naturally.

Trip Brain should behave like a passive memory layer sitting behind the group.

A good experience looks like:

```text
Monday:
12 Reels shared

Tuesday:
8 Reels shared

Wednesday:
17 Reels shared

Trip Brain:
37 Reels captured automatically
```

There should be no repeated prompts or interruptions asking people to classify or confirm their Reels.

---

## 10. Reliability Expectations

For this project, **missing data is worse than duplicate data**.

If the system is uncertain whether a Reel has already been captured, it is preferable to capture it again and resolve duplication later rather than silently ignore it.

The system should aim to:

- Capture the overwhelming majority of Reels shared in the group.
- Avoid silently dropping Reels.
- Retain failed Reels for future processing.
- Make failures visible to the product owner.
- Avoid requiring human intervention during normal operation.

---

## 11. Privacy Expectations

This is a private bachelor-trip tool.

The product should only capture information needed for the trip knowledge base.

It should not intentionally collect unrelated personal conversations from the Instagram group.

If a normal text conversation happens between friends, that conversation is not part of the product's intended dataset.

The focus is specifically on shared Reels and their associated trip knowledge.

---

## 12. MVP Scope

The MVP consists of:

1. Detect a Reel shared in the designated Instagram group.
2. Automatically ingest it.
3. Preserve the original Reel reference.
4. Preserve who shared it and when.
5. Capture useful content from the Reel.
6. Handle duplicate shares sensibly.
7. Track failed ingestion instead of silently losing it.
8. Provide a simple way for the product owner to verify what has been captured.

That is sufficient for V0.

---

## 13. Out of Scope

Do not prioritize the following while building the ingestion MVP:

- AI trip assistant.
- RAG search.
- Natural-language querying.
- Recommendations.
- Automatic itinerary creation.
- Voting.
- Group consensus.
- Maps.
- Route planning.
- Hotel integration.
- Flight integration.
- Expense tracking.
- Restaurant reservations.
- Real-time place availability.
- Weather.
- Automated travel planning.
- Public user accounts.
- Multi-trip support.
- Multi-group support.
- Commercial SaaS capabilities.
- Perfect place extraction.
- Perfect categorization.
- Sophisticated UI.

These can all be developed after the dataset exists.

---

## 14. Simple Internal View

A lightweight internal view should exist only so the product owner can verify that ingestion is working.

It should allow the owner to answer:

- How many Reels have been captured?
- What are the latest Reels captured?
- Who shared each Reel?
- Was the Reel successfully processed?
- What information was captured from it?
- Which Reels failed?
- Can a failed Reel be processed again?
- Can I open the original Reel?

This does not need to be polished.

It is an operational/debugging surface, not the main product.

---

## 15. Success Criteria

The MVP is considered successful when:

### User behavior

The bachelor group continues using Instagram exactly as before.

No one needs to learn a new workflow.

### Ingestion

Reels shared in the designated group automatically appear in Trip Brain.

### Knowledge preservation

Useful information communicated by the Reel is retained.

### Reliability

Temporary processing failures do not result in permanent loss of the Reel.

### Duplication

Repeated sharing of the same Reel does not create unnecessary repeated processing while still preserving who shared it.

### Independence

Future developers or agents can build completely different experiences on top of the captured dataset without needing to rebuild the ingestion process.

---

## 16. Definition of Done

V0 is done when the following real-world test passes:

> Add Trip Brain to the Thailand bachelor-trip workflow and let the group behave normally for several days.

During that period:

- Members share Reels normally.
- No member manually sends anything to Trip Brain.
- No member uses special commands.
- Newly shared Reels are automatically captured.
- The product owner can see which Reels were captured.
- Useful information from those Reels is retained.
- Duplicate shares are handled.
- Failed processing is visible and recoverable.
- The resulting dataset can be used later to build additional features.

If this works reliably, the Reel Ingestion MVP has achieved its purpose.

---

## 17. Guiding Principle for the Engineering Agent

When making implementation decisions, optimize for this priority order:

1. **Zero friction for the Instagram group.**
2. **Do not lose shared Reels.**
3. **Preserve the original knowledge faithfully.**
4. **Keep the ingestion layer independent of future product features.**
5. **Prefer a simple working MVP over unnecessary sophistication.**

The output of this phase is not a complete travel application.

The output is a **reliable stream of bachelor-trip knowledge generated automatically from the group's existing Instagram behavior**.
