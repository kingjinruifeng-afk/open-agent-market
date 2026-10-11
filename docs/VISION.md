# A market that personal agents can participate in directly

[English](VISION.md) · [简体中文](VISION.zh-CN.md)

## The future we want to make possible

A person tells an agent what they need. The agent discovers offers across a network, checks terms and evidence, asks the seller's agent focused questions, and brings back a useful comparison. When the person chooses, both agents can record what was agreed, follow the transaction through external services, and retain feedback for their next relationship.

A shop or individual seller describes an offering through an agent: an authorized export, a photo, a spoken explanation or structured input. The agent asks for missing facts, publishes a signed version, answers predictable questions from maintained knowledge, and keeps price and availability current.

Neither side should surrender its entire identity and history to a single mandatory marketplace. Multiple discovery, hosting and evidence services can compete to be useful participants in the same network.

This is the vision. The reference implements a limited ordinary-goods workflow; the entire future described here is not yet delivered.

## Access, structure and trust

An agent can imitate a human browsing a site, but that is a fragile foundation for commerce. It inherits layouts, access restrictions, inconsistent descriptions, uncertain freshness and platform-specific histories. More browser automation does not supply portable agreements, signed prices or explanations of where a reputation figure came from.

We want sellers and developers to have another path: an open supply and interaction protocol designed for agents from the beginning. It must reduce both the work to publish a useful offer and the work for another agent to understand it.

This does not require every marketplace to disappear. Manufacturer sites, seller pages, payment processors, delivery and merchant tools remain useful. Clean boundaries should prevent access to one indispensable service becoming ownership of the entire relationship.

## What belongs in the protocol

The core describes identities and signing authority; versioned offers and sources; endpoints and recent availability; quotes and acceptance; minimal transaction links and evidence commitments; feedback attribution; and dispute procedures with appeal and correction.

Agents need predictable failures. Expired quotes, missing dependencies, stale versions, insufficient reviewers and exhausted budgets must be structured conditions rather than clues hidden in a human-facing page.

The core should be small enough to implement independently. Categories, logistics, stock reservations, verified payment events, booking calendars and regional requirements belong in versioned extensions. Transport adapters let hosts integrate using their own tool conventions.

## Where data lives

Sellers retain authoritative product material. Participants hold keys, preferences and private evidence. Chosen archives retain an agreed portion of public signed history. Search and reputation services build views within declared coverage scopes.

Participants do not need every global event. Discovery can be organized by category, community or geography, with bounded queries and selective replication. An individual agent should not become a global search engine simply to buy a product.

Images, long descriptions and stable specifications should reuse authorized resources. A manufacturer page is a specification source; it does not prove a seller's authenticity, stock, warranty or customer experience. Minimum offer fields must remain usable when an external page is unavailable.

Storage, bandwidth and uptime cost money. Operators need transparent retention, export, fee and capacity policies. A volunteer relay or content-addressed link is not a promise of free permanent storage.

## Persistent identity and bilateral trust

A seller builds a history of accurate description, quality, shipping and service. A buyer builds a history of payment communication, handover and reasonable cooperation during returns. Reviewer contributions are separate and do not boost commercial scores.

The protocol must not collapse these into one authoritative number. A time-sensitive purchase and a repairable second-hand item deserve different weighting. Dimensions, sample sizes, dates, sources and uncertainty should be visible so an agent can explain its decision.

Free identities help access, but signatures and distinct keys do not prove independent people or real transactions. A transaction graph can be fabricated. Production trust needs stronger evidence classes, limits on repeated reciprocal influence, relationship disclosure, appropriate attestations and adversarial evaluation.

Real-name integration is not a prerequisite for the international pilot. Optional verified attributes may help later, but should not become a new gatekeeper for all participation.

## Fair review and ordinary rights

Returns, refunds, negative feedback and disagreement are part of commerce. Treating them automatically as suspicious would punish the people the system should help. Integrity findings must be separate from unfavorable outcomes or low product ratings.

Objective checks establish signatures, authorization, versions and procedural violations. Contested facts require evidence and qualified independent judgment. An agent may summarize evidence or explain rules; it should not pretend to be an independent human reviewer.

The reference explores three-person initial review, five-person non-overlapping appeal, committed opinions before disclosure, an appeal window before serious findings take effect, and later correction. These are procedural experiments, not legal arbitration or a completed decentralized court.

Incentives should reward accountable contribution and evidence quality, not agreement with the majority or raw judgment counts. Hidden collusion, expertise, randomness and conflicts of interest remain difficult questions. We invite counterexamples instead of presenting them as solved.

## Availability and efficiency

A discoverable seller service should be available for interaction. An always-on host can maintain seller endpoints. Unavailable services should expire from active discovery while retained archives preserve identity and transaction history.

Distributed detection cannot guarantee instant knowledge of failure. The reference uses short-lived signed presence proofs and declares its cache window. Availability does not reserve stock or guarantee fulfillment of an order.

Most traffic should be cheap: schemas, filters, signatures, facts, FAQ, cache hits and selective reads. Model inference belongs to remaining personalized questions. Hosts need concurrency, time, bandwidth and model budgets; a 24/7 agent is not permission for unlimited compute.

## How this becomes useful

First provide a reproducible reference and independently implementable contracts. Then two actual hosts and two independent operators should demonstrate interoperability and migration. Real sellers and buyers can show whether publishing and discovery justify switching workflows.

Measure access cost, freshness, query usefulness, response success, private-evidence handling, migration, rights protection and operator economics. Test fabricated receipts, collusive ratings, forks, unavailable sellers and manipulated reviewer selection.

Growth follows useful integrations and credible evidence. We want to earn attention through working examples, honest boundaries, responsive issues and opportunities to influence the protocol while it is small.

## An invitation

If you build a personal agent, show one commerce task users cannot reliably complete today. If you build merchant tools, help make publishing cheaper. Protocol and security developers can challenge trust and migration. Independent operators can test whether portability survives a real failure.

The project succeeds when participants choose their agents and providers without losing discovery, interaction or history. The [roadmap](ROADMAP.md) lists concrete steps we can take together.
