## System Requirements Document: Agentic Creator Intelligence Platform (Rox Hackathon)

**Version:** 1.0 (Hackathon MVP) **Date:** 2025-09-13

### 1\. Introduction

#### 1.1 Purpose

This document specifies the system requirements for a proof-of-concept **Agentic Creator Intelligence Platform**. The project is being developed for the Rox hackathon at Hack the North. Its purpose is to rebuild a foundational Creator CRM and augment it with AI-powered "Revenue Agents" that align with Rox's vision of an Agentic CRM. The system will demonstrate how autonomous agents can help content creators manage their audience, understand engagement, and identify revenue-driving opportunities.

#### 1.2 Scope

The project scope is divided into two phases for the hackathon:

1. **Phase 1 (Core MVP):** Rapidly implement a robust, local-first data platform for ingesting and managing Instagram audience data. This includes the core entities: Profiles, Events, Campaigns, and a manual Attribution system.  
2. **Phase 2 (Agentic Layer):** Build AI-powered agentic features on top of the data platform. These agents will perform proactive analysis, monitor for key events (like churn or follow-backs), and provide actionable suggestions to the user.

The system will be a standalone, local-first web application. All complex, time-consuming features like fully automated attribution will be deferred in favor of manual controls and targeted agentic capabilities.

#### 1.3 Definitions, Acronyms, and Abbreviations

- **Agent:** An AI-powered, autonomous system designed to perform specific tasks, monitor data, and provide actionable insights.  
- **Agentic Feature:** A system capability driven by an Agent.  
- **CRM:** Customer Relationship Management.  
- **Profile:** A unique record representing an Instagram user.  
- **Event:** An immutable record of an interaction (e.g., `FOLLOWED_ME`).  
- **Campaign:** A creator's content or outreach effort. For example: story, post, reel.  
- **Snapshot timeline:** A chronological record of processed data snapshots, used for idempotence.

---

### 2\. Overall Description

#### 2.1 Product Perspective

This project is a prototype designed to impress Rox by showcasing a practical application of their "Agentic CRM" philosophy in the creator economy. It functions as a local-first platform where a creator can manage their audience data, with AI agents working in the background to surface insights and automate research, mirroring the function of Rox's "Agent Swarm" for enterprise sales.

#### 2.2 Product Functions

The system's functions are separated into the foundational MVP and the agentic layer.

**Core MVP Functions:**

- **Timeline-Based Data Ingestion:** Process Instagram data exports chronologically.  
- **Audience & Campaign Management:** Provide a UI to view, search, and manage profiles, profile events, and campaigns.  
- **Campaign Metrics:** Provide a UI to view vital statistics regarding new followers (by date, graph included) and churned audience.  
- **Manual Event Attribution:** Allow users to manually link events to campaigns and reasons.

**Agentic Functions (Hackathon Goal):**

- **Churn Risk Agent:** Proactively identifies and researches users who have unfollowed.  
- **Agent Action Center:** A dedicated UI to display agent findings and suggested actions.  
- **Automatic Draft Generation (Pre-Campaign):** A userscript to automate posting the same image/video assets across multiple platforms, including searching for the proper account usernames to tag, trending hashtags on each platform, etc.  
- **Draft Revision (Pre-Campaign):** Recommend modifications to proposed campaign material.  
- **Automated Export Flow (Post-Campaign):** Userscript to automate data export to specs required by this program. Note: not agentic, but looks cool while being TOS-compliant.  
- **Proactive Campaign Plan Proposals:** Proposes future campaign plans based on previous knowledge sources.

#### 2.3 User Characteristics

The primary users are the hackathon judges from Rox and, conceptually, content creators. The system must be highly demoable, with a clear and compelling narrative that showcases business value.

#### 2.4 General Constraints

- The system MUST be a local-first application, storing all data in a local SQLite database.  
- The UI MUST be polished and intuitive for a compelling demonstration.

---

### 3\. Functional Requirements (Hackathon MVP)

#### 3.1 FR-1: Data Ingestion & Timeline Management

- **FR-1.1: ZIP Archive Processing:**  
    
  - The system shall provide a UI that accepts a `.zip` file as input.  
  - The script must be able to open and read the contents of the ZIP archive on the client side without requiring manual extraction.  
  - The script must locate and parse the following specific files from within the archive, tolerating their presence within a nested root directory (e.g., `instagram-username-date/...`):  
    - `connections/followers_and_following/followers_1.json`  
    - `connections/followers_and_following/following.json`  
    - `connections/followers_and_following/pending_follow_requests.json`  
  - These JSON files must be sent to the ingestion API in a single request.


- **FR-1.2: Chronological Idempotence (Timeline):**  
    
  - If the RW timestamp of the `followers_1.json` file is reasonable (after the year 2010), then rely on that as the timestamp of the snapshot. Otherwise, The system shall parse the date from the input ZIP archive's filename, which follows the pattern `instagram-username-YYYY-MM-DD-....zip`.  
  - This `YYYY-MM-DD` date shall be recorded in a `Snapshot` table in the database.  
  - The system shall refuse to process an archive if its date has already been recorded in the `Snapshot` table, ensuring each day's snapshot is processed only once.

- **FR-1.3: State-Based Event Generation and Flag Updates:**  
    
  - The system shall compare the list of usernames from the current snapshot against the stored state flags (`is_active_follower`, `is_currently_following`, `is_pending_outbound_request`) in the `Profile` table to generate events and update flags.  
      
  - **FR-1.3.1 (Inbound Followers \- `followers_1.json`):**  
      
    - **New Follower:** For each username in the list whose `Profile` has `is_active_follower = false`, the system shall:  
      1. Create a `FOLLOWED_ME` event.  
      2. Update the `Profile` to set `is_active_follower = true`.  
    - **Unfollow:** For each `Profile` with `is_active_follower = true` whose username is absent from the list, the system shall:  
      1. Create an `UNFOLLOWED_ME` event.  
      2. Update the `Profile` to set `is_active_follower = false`.

    

  - **FR-1.3.2 (Outbound Follows \- `following.json`):**  
      
    - **New Outbound Follow:** For each username in the list whose `Profile` has `is_currently_following = false`, the system shall:  
      1. Create an `I_FOLLOWED` event.  
      2. Update the `Profile` to set `is_currently_following = true`.  
      3. Update the `Profile` to set `is_pending_outbound_request = false` (as the request is now accepted).  
    - **Outbound Unfollow:** For each `Profile` with `is_currently_following = true` whose username is absent from the list, the system shall:  
      1. Create an `I_UNFOLLOWED` event.  
      2. Update the `Profile` to set `is_currently_following = false`.

    

  - **FR-1.3.3 (Pending Outbound Requests \- `pending_follow_requests.json`):**  
      
    - **New Pending Request:** For each username in the list whose `Profile` has `is_pending_outbound_request = false` and `is_currently_following = false`, the system shall:  
      1. Create a `FOLLOW_REQUEST_SENT` event.  
      2. Update the `Profile` to set `is_pending_outbound_request = true`.  
    - **Pending Request Withdrawn/Rejected:** For each `Profile` with `is_pending_outbound_request = true` whose username is absent from this list AND also absent from `following.json`, the system shall:  
      1. Update the `Profile` to set `is_pending_outbound_request = false`.  
      2. Create a `PENDING_REQUEST_CANCELLED` event.

#### 3.2 FR-2: Core Data Management UI

- **FR-2.1: Profile List View:**  
    
  - The main UI screen shall display a paginated table of all profiles from the database.  
  - The view must include the following interactive controls for filtering the list:  
    - A text input for searching by `current_username` or historical usernames.  
    - A set of buttons to filter by status (`All`, `Follower`, `Following`, `Mutual`, `Pending`, `None`).


- **FR-2.2: Campaign Management UI:**  
    
  - The UI shall include a "Campaign Manager" section.  
  - This section must contain a form with inputs for `campaign_name` (text), `campaign_date` (date picker), and `campaign_type` (dropdown: `CONTENT` or `OUTBOUND_FOLLOW`) to create new campaigns.  
  - It must also display a table of all existing campaigns, with buttons on each row to edit or delete the campaign.


- **FR-2.3: Profile Detail View (`ProfileSheet`):**  
    
  - Clicking a profile in the main list shall open a side sheet (`ProfileSheet`) displaying detailed information for that user.  
  - This view must display:  
    - The profile's complete timeline of `InteractionEvents`, sorted with the most recent event first.  
    - A text area displaying the profile's `Notes`, with a button to enter an edit mode.

#### 3.3 FR-3: Manual Attribution System

- **FR-3.1: Event-Level Attribution Control:**  
    
  - For each `InteractionEvent` displayed in the `ProfileSheet` timeline, the UI shall provide an interactive control (e.g., a button or popover) to manage its attribution.  
  - The attribution control must include:  
    - A dropdown menu to select an `AttributionReason` from a predefined list (e.g., `OP_CAMPAIGN`, `DISCOVERY`, `INIT`).  
    - A second dropdown menu to select an existing `Campaign` from the database. This dropdown must be enabled and required if the selected reason is `OP_CAMPAIGN`.  
    - A "Save" button to commit the attribution and a "Clear" button to remove it.


- **FR-3.2: Bulk Attribution UI:**  
    
  - The main profile list table shall include a checkbox for each row to allow multi-selection.  
  - When one or more profiles are selected, a "Bulk Attribution" button shall become active.  
  - Clicking this button shall open a modal or sheet (`BulkProfilesAttributionSheet`) containing the same attribution controls as in FR-3.1.  
  - Applying the bulk attribution shall assign the selected reason and campaign to the latest `InteractionEvent` of a user-specified type (`FOLLOWED` or `UNFOLLOWED`) for all selected profiles.

#### 3.4 FR-4: Agentic Features

- **TBD**

---

### 4\. Non-Functional Requirements

- **NFR-1 (Privacy):** The application must be local-first. All data resides on the user's machine.  
- **NFR-2 (Usability):** The UI must be clean, modern, and intuitive, prioritizing a smooth demonstration experience.  
- **NFR-3 (Performance):** Core UI interactions (filtering, searching) must be responsive. Agentic processes can run asynchronously in the background.  
- **NFR-4 (Demoability):** The system must be easily seeded with data to allow for a compelling, end-to-end demonstration within a 5-minute pitch. The story of "problem \-\> agentic solution \-\> business value" must be clear.

---

### 5\. Future Requirements (Post-Hackathon Vision)

To align with Rox's long-term vision, the following agentic capabilities are planned for future development:

#### 5.1 Pre-Campaign Agent

- **Research & Planning:** An agent that analyzes trending topics, hashtags, and competitor activity to recommend themes and keywords for upcoming content campaigns.  
- **Content Assistance:** An agent that reviews draft campaign materials (text, images) and suggests modifications based on past performance data to optimize for engagement.  
- **Automated Scheduling:** An agent that turns a folder of content into scheduled drafts on social media platforms.

#### 5.2 Post-Campaign Agent

- **Automated Reporting:** An agent that automatically runs the data export, ingests the new data, and generates a performance report for a completed campaign, calculating vital metrics like net follower change and engagement rate.  
- **Intelligent Churn Analysis:** An agent that goes beyond reporting churn by attempting to identify patterns among churned users (e.g., "A high percentage of churned users were from the 'Outbound Wave Jan' campaign," suggesting low-quality lead acquisition).  
- **Strategic Adaptation:** An agent that synthesizes performance data from multiple past campaigns to propose strategic adaptations for future content (e.g., "Campaigns featuring video content have a 30% lower churn rate. Recommend prioritizing video for the next quarter.").
