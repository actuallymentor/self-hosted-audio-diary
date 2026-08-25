# Self-Hosted Multimedia Diary

## 1. Purpose

Build a **self-hosted, Docker-based progressive web application (PWA)** for keeping a long-term personal diary.

The application is primarily intended to make **voice journaling extremely low-friction**:

1. Open the application.
2. Press record.
3. Talk.
4. Stop recording.
5. The recording is safely stored.
6. A transcription is generated automatically.

The diary is not limited to audio. A day may contain:

* Audio recordings
* Text notes
* Images
* Videos
* Tags

Over time, the accumulated diary should become a searchable personal archive that can also be queried using an LLM for reflection over periods such as the previous week, month, quarter, year, or an arbitrary custom period.

The application is intended for a small number of trusted users rather than public-scale operation.

The main design priorities are:

* Very low friction
* Self-hosting
* Data ownership
* Human-readable files
* Offline capability
* Robust recording and synchronization
* Long-term maintainability
* Simple infrastructure
* Good mobile/PWA UX
* Searchability over years of data
* LLM-assisted reflection

---

# 2. General Architecture

The application should be distributed as a Docker Compose project.

The main application consists of **one primary application container** containing both:

* Backend/API
* Frontend

The frontend should be built using:

* React
* Vite

Vite produces the static frontend assets.

The application backend serves:

* The compiled frontend
* Dynamic API routes
* Authentication routes
* Media APIs
* Diary APIs
* Search APIs
* Reflection APIs

There should therefore be no requirement for separately deployed frontend and backend containers.

A reverse proxy outside the application handles:

* HTTPS/TLS
* Public hostname
* Certificates

The application itself only needs to expose HTTP internally.

---

# 3. Docker Deployment

The application must be easy to deploy through Docker Compose.

At minimum, the Compose configuration should expose two persistent data locations.

## 3.1 Application data path

A configurable volume/path intended for relatively small, frequently accessed application data.

This will typically live on fast storage such as NVMe.

Possible contents include:

* SQLite database
* User database
* Password hashes
* Search indexes
* Application configuration
* Job state
* Transcription state
* Derived indexes
* Internal metadata

Example conceptual environment variable:

```text
APP_DATA_PATH=/data/app
```

The exact name is not important at this requirements stage.

---

## 3.2 Diary/media path

A separate configurable volume/path used for the actual diary archive.

This may live on slower but much larger storage such as a RAID array.

Possible contents include:

* Audio
* Video
* Images
* Text notes
* Transcripts
* Day metadata
* Saved reflections

Example conceptual environment variable:

```text
DIARY_DATA_PATH=/data/diary
```

The application must **not assume that application state and diary media reside on the same filesystem**.

---

# 4. Data Philosophy

The user's diary must ultimately exist as normal files and directories on disk.

The file archive should remain useful without the application.

It should therefore be possible for a server administrator to browse the diary using ordinary filesystem tools.

Avoid making the database the sole source of truth for diary content.

The database may contain indexes, cached information, derived metadata, authentication data, and other operational state.

The fundamental diary content should remain directly accessible on disk.

---

# 5. User Directory Structure

Each user has their own directory.

A user's email address may be used as the basis for the directory name, assuming appropriate filesystem-safe normalization.

Conceptually:

```text
/diary/
  john@example.com/
  alice@example.com/
```

Within each user directory, diary content is primarily organized by date.

For example:

```text
/diary/
  john@example.com/
    2026-08-24/
    2026-08-25/
    2026-08-26/
```

The **day is the canonical organizational unit**.

This is an important design decision.

Individual recordings or notes are subordinate objects belonging to a day rather than the diary being modeled primarily as an unstructured list of entries.

---

# 6. Day Model

Each calendar day represents one diary container.

A day may contain zero or more:

* Audio recordings
* Text notes
* Images
* Videos

A day may additionally have:

* Freeform tags
* Metadata
* Transcripts

Example conceptual directory:

```text
2026-08-24/
  audio/
    18-22-31.webm
    21-04-12.webm

  images/
    15-33-18.jpg

  video/
    19-14-02.mp4

  text/
    18-45-03.txt
    22-11-19.txt

  transcripts/
    18-22-31.txt
    21-04-12.txt

  metadata.json
```

The exact layout is an implementation decision, but the following characteristics matter:

* Easy for humans to understand
* Easy to back up
* Deterministic
* Does not require the application to interpret proprietary binary databases
* Supports multiple objects of the same type in a day
* Stores sufficient timestamps to reconstruct chronology

---

# 7. Metadata

Where practical, standard media metadata should be used.

For example, audio/image/video files may include metadata such as:

* Creation timestamp
* Recording timestamp
* MIME type
* Duration
* Codec
* Original filename

However, the application may also maintain a simple day-level metadata file where this is more robust or convenient.

For example:

```json
{
  "date": "2026-08-24",
  "tags": ["work", "kosovo", "ideas"],
  "items": []
}
```

This is illustrative rather than a required schema.

The application should not rely solely on opaque database metadata to determine what the files mean.

---

# 8. Accounts

The system supports multiple users.

Expected scale is relatively small:

* Owner
* Partner
* Friends
* Other explicitly invited users

There is no requirement for large-scale public account infrastructure.

---

# 9. First User / Administrator

The first account created on a fresh installation becomes the administrator.

The administrator can authorize additional accounts.

Public unrestricted registration should **not** exist.

Possible acceptable flows include:

* Administrator directly creates the user.
* Administrator whitelists an email address and that person completes registration.

The exact invitation UX can be selected during implementation.

---

# 10. Authentication

Users authenticate using:

* Email
* Password

Passwords must never be stored directly.

Use a standard modern password-hashing mechanism such as bcrypt or an equivalently appropriate password hashing implementation.

Authentication should be implemented competently even though the application is intended for a trusted self-hosted environment.

The application does not require application-level encryption of diary files.

Audio, transcripts, text, images, and videos are intentionally stored in ordinary readable form on the server.

---

# 11. Authorization

Users interact with their own diary through the UI.

There is no requirement for an administrator-facing interface that allows the administrator to browse every user's diary.

The administrator already controls the physical/server filesystem and therefore does not need a separate application-level surveillance interface.

---

# 12. Primary UI

The default/home experience should make recording extremely prominent.

Opening the application should immediately expose a large, obvious:

**Record**

action.

The common path should require very few interactions.

Conceptually:

```text
Open app
    ↓
Record
    ↓
Speak
    ↓
Stop
    ↓
Saved
```

The interface should not force users through unnecessary forms before recording.

---

# 13. Audio Recording

Audio is expected to be the dominant diary input mechanism.

Users can create:

* One recording per day
* Several recordings per day
* Long recordings

There should not be an arbitrary short application-level maximum recording duration.

---

# 14. Audio Codec Strategy

The client should select an appropriate browser-supported format at runtime.

Preferred format:

* Opus in WebM

Fallback where necessary:

* AAC in MP4 or another natively supported browser recording format

The application should use browser capability detection rather than assuming every browser provides the same `MediaRecorder` codec.

Server-side normalization/transcoding may be performed if useful.

The system should retain audio at sufficiently high quality that the archive could reasonably be reused in the future rather than aggressively optimizing for minimum file size.

Audio should not be unnecessarily low bitrate.

---

# 15. Recording Reliability

Recording must be designed around the possibility of:

* Temporary network loss
* Poor Wi-Fi
* Switching networks
* Server temporarily unavailable
* Large recordings
* Long recordings
* Browser reloads where technically recoverable

The recording should therefore be **local-first** rather than depending on a continuously functioning connection to the server.

---

# 16. Recording Chunks

For resilience, long recordings should be represented internally as chunks.

Conceptually:

```text
recording
 ├── chunk 0001
 ├── chunk 0002
 ├── chunk 0003
 ├── ...
 └── finalization
```

Chunks should first be persisted locally.

Uploads can subsequently occur when connectivity is available.

Each chunk should have enough identity information for uploads to be:

* Idempotent
* Retryable
* Resumable

The server should be able to determine whether it already possesses a chunk.

A temporary connection failure should therefore not require restarting a long upload from zero.

The final recording can be assembled/finalized once all required chunks have reached the server.

---

# 17. Offline Operation

The application should behave as an offline-capable PWA.

At minimum, while offline the user should be able to:

* Open the installed/cached application
* Record audio
* Save pending recordings locally
* Create text notes
* Queue content for synchronization

When connectivity returns, pending content should synchronize to the server.

The application should make synchronization state understandable to the user.

Examples:

* Saved locally
* Uploading
* Synced
* Transcribing
* Complete
* Retry required

The exact wording is an implementation decision.

---

# 18. Wake Lock

During an active recording, the application should request a browser **Screen Wake Lock** where available.

The intention is to prevent the device from unnecessarily turning the screen off while a diary recording is in progress.

Wake lock should only be held when needed and released after recording stops.

If the lock is lost, the app should attempt to reacquire it where appropriate.

---

# 19. Text Notes

A day can contain multiple text notes.

The normal expectation may be approximately one text note per day, but the model must not impose this limitation.

For example:

```text
2026-08-24
  Text note 1
  Text note 2
  Text note 3
```

Text notes should ultimately be stored as ordinary text files.

UTF-8 should be assumed.

---

# 20. Images

Users can attach images to a day.

Images should:

* Be retained as normal files
* Preserve useful quality
* Have timestamps
* Appear chronologically in the day's UI

The application should not require images to be embedded into a database.

---

# 21. Video

Users can attach video to a day.

Videos should similarly be stored as ordinary media files.

The application does not need sophisticated video editing.

The basic requirements are:

* Upload
* Store
* Associate with day
* Display/play back

---

# 22. Day Timeline

When viewing a day, its items should preferably be displayed chronologically.

For example:

```text
09:14  Text note
11:03  Audio — 08:32
14:16  Image
18:42  Audio — 17:55
22:02  Text note
```

This preserves the diary-like sense of a day unfolding over time.

---

# 23. Tags

Tags are associated with the **day**, not individual items, for the initial version.

Users can freely create arbitrary tags.

There is no requirement for a predefined taxonomy.

Examples:

```text
work
travel
family
kosovo
idea
stress
holiday
```

Tags should be normalized to lowercase plain text.

The application can normalize whitespace and other obviously equivalent representations as appropriate.

Tagging should be low-friction.

---

# 24. Transcription

Once an audio recording reaches the server, it should automatically be queued for transcription.

Transcription occurs after recording rather than being live.

The resulting transcript should be stored as an ordinary text file alongside or logically adjacent to the recording.

For example:

```text
audio/18-22-31.webm
transcripts/18-22-31.txt
```

The mapping between recording and transcript should be deterministic.

---

# 25. Local Transcription

The default transcription architecture should use a **local open-source speech-to-text model**.

Likely candidates include:

* Whisper-family models
* faster-whisper
* Parakeet-family models

The implementation plan should select the specific engine after considering:

* English quality
* Dutch quality
* CPU/GPU support
* Memory requirements
* Model size
* Throughput
* Ease of Docker deployment

The implementation should not tightly couple the rest of the application to one transcription model.

---

# 26. Transcription Service Architecture

The transcription engine should preferably operate as a **separate service/container within the same Docker Compose stack**, rather than embedding the entire inference runtime into the primary web application container.

Conceptually:

```text
┌─────────────────────┐
│     App container   │
│                     │
│ React + API + jobs  │
└─────────┬───────────┘
          │
          │ internal request / queue
          ▼
┌─────────────────────┐
│ Transcription       │
│ service             │
│                     │
│ Whisper/Parakeet    │
└─────────────────────┘
```

Reasons include:

* Independent inference dependencies
* Easier model replacement
* Cleaner main container
* Easier GPU configuration
* Easier restart/upgrade behavior
* Easier future experimentation

The rest of the application should treat transcription as a service rather than directly depending on model-specific internals.

---

# 27. Transcription Jobs

Transcription should be treated as asynchronous work.

A recording may therefore move through states such as:

```text
recorded
→ uploading
→ uploaded
→ queued
→ transcribing
→ complete
```

Failures should be retryable.

Transcription failure must **never result in loss of the original audio**.

The audio is canonical; transcription is derived data.

---

# 28. Search

The diary should support broad search across the user's history.

Search should include at minimum:

* Text notes
* Audio transcripts
* Tags

The experience should be as fuzzy and forgiving as reasonably feasible.

Users should not need to remember exact phrasing.

---

# 29. Long-Term Search Scale

The design should assume users may use the diary for many years.

A user's archive might eventually include:

* Thousands of days
* Thousands or tens of thousands of audio recordings
* Millions of words of transcript text
* Large amounts of associated media

Search should therefore not scan every text file from disk for each query.

---

# 30. Search Index

Maintain a derived search index on the fast application-data volume.

SQLite is appropriate for this scale.

SQLite FTS5 or an equivalent full-text indexing mechanism is a good baseline.

Conceptually:

```text
Flat diary files
       │
       ▼
Indexer
       │
       ▼
SQLite / FTS search index
```

The database may contain copies of searchable text because this data is **derived** from the flat-file archive.

The search index should be considered disposable/rebuildable.

If the SQLite search database is deleted, it should in principle be possible to reconstruct it from the diary filesystem.

---

# 31. Fuzzy Search

Initial search should support useful combinations of:

* Full-text matching
* Prefix matching
* Normalized text
* Tag filtering
* Date filtering

Additional fuzzy matching may be implemented where practical.

The architecture should leave room for future semantic/vector search, but semantic search is not a mandatory initial feature.

---

# 32. Search Results

Search results should give sufficient context to understand the hit.

For example:

```text
24 Aug 2026 — audio transcript
"...we talked about whether we should expand the battery project..."

Tags: work, kosovo
```

Selecting a result should navigate directly to the corresponding day and preferably the corresponding item.

---

# 33. Reflection Feature

The application contains a separate **Reflection** workflow.

Reflection allows a user to ask an LLM questions about their diary over a chosen period.

This should feel different from ordinary keyword search.

Search answers:

> Where did I mention X?

Reflection answers questions such as:

> What seemed to occupy most of my attention this month?

> What themes have repeatedly come up?

> What changed compared with the previous quarter?

> What projects did I keep saying I would finish but did not?

---

# 34. Starting a Reflection

The user selects **Start Reflection**.

They then choose a time range.

Built-in rolling ranges should include:

* Week — previous 7 days
* Month — previous 30 days
* Quarter — previous 90 days
* Year — previous 365 days
* Custom range

These are rolling periods rather than necessarily calendar-aligned periods.

For example, "Month" means approximately:

```text
today - 30 days → today
```

rather than strictly "the current calendar month."

---

# 35. Reflection Question

After choosing the time range, the user asks a question.

Input may be:

* Text
* Audio

If the question is audio, the normal transcription pipeline can convert it to text.

---

# 36. Reflection Context

The reflection system should gather diary content for the selected period.

Potential sources include:

* Text notes
* Audio transcripts
* Day tags
* Relevant day metadata
* Previously generated derived summaries if implemented

Media itself does not necessarily need to be sent to the LLM unless a later feature explicitly requires multimodal analysis.

The primary reflection corpus is textual.

---

# 37. Large Reflection Windows

A year of transcripts may exceed the context window of an LLM.

The reflection architecture should therefore anticipate hierarchical processing rather than assuming the entire raw diary can always be placed into a single prompt.

Possible strategy:

```text
raw days
   ↓
day/chunk summaries
   ↓
period summaries
   ↓
relevant source retrieval
   ↓
final reflection
```

The exact implementation is for the coding plan to determine.

However, reflection across long periods must not silently truncate older material simply because the prompt became too large.

---

# 38. Grounding Reflections

Where feasible, reflections should reference the diary material that produced the conclusion.

For example:

```text
You mentioned difficulty concentrating repeatedly around 4, 7 and 12 August.
```

The UI may allow those references to link back to the source day.

The goal is to make reflections inspectable rather than producing unexplained generic LLM observations.

---

# 39. OpenRouter

LLM inference for reflections will use **OpenRouter**.

The Docker deployment should therefore accept configuration for:

* OpenRouter API key
* Default OpenRouter model

Conceptually:

```text
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=...
```

The exact environment-variable names can be finalized during implementation.

The default model should be configurable without rebuilding the Docker image.

---

# 40. Reflection Results

The initial reflection result is text.

For example:

```text
Reflection: Last 30 Days

Question:
"What projects have occupied most of my attention?"

Answer:
...
```

---

# 41. Saving Reflections

Reflections are saved automatically.

They should ultimately exist as ordinary text files inside the user's diary storage.

They should include enough metadata to understand:

* When the reflection was generated
* Which date range it covered
* What question was asked
* Which model generated it
* The resulting answer

Possible conceptual format:

```text
reflections/
  2026-08-24T18-30-00.md
```

Markdown is a reasonable plain-text format for reflections.

The exact placement can be decided during implementation.

---

# 42. Text-to-Speech

A saved/generated reflection can optionally be converted to speech.

The normal output remains text.

The user can explicitly choose something equivalent to:

**Listen**

This invokes a text-to-speech provider.

The TTS implementation should be configurable and not deeply coupled to the reflection code.

The initial implementation may use an external API/provider rather than requiring local speech synthesis.

Provider/model/voice selection should be treated as configuration.

---

# 43. Reflection History

Because reflections are saved, the user should be able to revisit previous reflections.

A reflection history should provide at least:

* Creation date
* Selected diary period
* Question
* Response

This allows reflection itself to become part of the user's long-term diary archive.

---

# 44. Home / Today View

A useful default screen would center around the current day.

Conceptually:

```text
Monday, 24 August 2026

[ RECORD ]

+ Text
+ Photo
+ Video

Today
─────────────────────────
10:22  Audio · 04:33
       ✓ Transcribed

13:40  Text
       "Had an interesting..."

18:14  Audio · 12:01
       ● Transcribing

Tags
[work] [ideas] [+]
```

Exact visual design is not prescribed.

The important thing is that recording remains the dominant action.

---

# 45. Calendar / Historical Navigation

Users need a straightforward way to navigate previous days.

Suitable interfaces may include:

* Calendar
* Infinite chronological diary
* Date picker
* Search

A day should have a stable route such as conceptually:

```text
/day/2026-08-24
```

The exact URL structure is not prescribed.

---

# 46. Media Playback

Previously recorded media should be usable directly from the application.

Audio:

* Play
* Pause
* Seek
* Show duration

Video:

* Play
* Pause
* Seek

Images:

* View
* Enlarge

Text:

* Read
* Edit where appropriate

---

# 47. Editing

Text notes should be editable.

Tags should be editable.

The implementation plan should define sensible behavior for editing transcripts.

A useful default is likely:

* Machine transcript exists.
* User may correct it.
* The corrected text becomes the searchable/displayed transcript.

Care should be taken not to accidentally regenerate over manual corrections.

---

# 48. Deletion

Deletion behavior was not fully specified during requirements discussion.

The implementation plan should therefore choose a simple, predictable model.

Important principle:

Deleting derived data such as a transcript must not accidentally delete the original recording unless the user explicitly deletes the recording itself.

A trash/soft-delete model may be considered, but it is not currently a mandatory feature.

---

# 49. No Export Feature

Do **not** build an application-level export feature in the initial implementation.

The flat-file architecture already means server administrators can back up, inspect, copy, synchronize, or archive the underlying data using ordinary filesystem tooling.

No ZIP-export UI or similar feature is required.

---

# 50. Backups

The application itself does not need to implement a backup service.

Its storage model should make conventional server backups straightforward:

```text
APP_DATA_PATH
DIARY_DATA_PATH
```

can independently be backed up using the administrator's existing infrastructure.

The diary directory should remain useful independently of the application database wherever practical.

---

# 51. PWA Requirements

The frontend should be installable as a Progressive Web App.

At minimum:

* Web app manifest
* Appropriate icons
* Installable standalone mode
* Service worker
* Cached application shell
* Offline startup
* Local pending data
* Synchronization after reconnect

The application should be pleasant to use from a phone as the primary interface.

Desktop should also work.

---

# 52. Local Client Storage

Offline pending diary content requires browser-side persistence.

The implementation will likely use IndexedDB or an abstraction around IndexedDB.

Do not rely on `localStorage` for media recordings.

Client-side state needs to cope with potentially large audio blobs.

The coding plan should explicitly design:

* Recording chunk persistence
* Upload state
* Retry state
* Cleanup after successful synchronization
* Recovery after reopening the PWA

---

# 53. Synchronization

Synchronization should be resilient and idempotent.

The server should not create duplicate recordings simply because the client retried a request.

Each local object should therefore have a stable identifier before upload.

For example:

```text
recording UUID
  ├── chunk 0
  ├── chunk 1
  ├── chunk 2
  └── ...
```

The server can record which chunks have already arrived.

Once synchronization completes, the client may safely remove the corresponding local media after an appropriate confirmation state.

---

# 54. Concurrent Use

The server may be used by several people simultaneously.

It does not need infrastructure designed for thousands of concurrent users.

However, basic concurrency correctness is required.

For example:

* Two users uploading simultaneously should work.
* A transcription job for one user must not interfere with another.
* User files must not be written into the wrong account.
* Concurrent jobs should not corrupt metadata.

---

# 55. Date and Time Semantics

Diary days should correspond to the user's local calendar day rather than blindly grouping content according to UTC.

Recordings should retain precise timestamps.

The system should preserve enough timezone information to avoid ambiguity, particularly if a user travels.

The coding plan should explicitly decide how to store:

* UTC timestamp
* Local timestamp
* Timezone/offset
* Canonical diary date

A sensible model is to store absolute timestamps while assigning each item to the local date on which it was created.

---

# 56. Derived vs Canonical Data

The application should clearly distinguish between **canonical** and **derived** information.

Canonical examples:

* Audio recording
* User-entered text
* Uploaded image
* Uploaded video
* User tags

Derived examples:

* Transcripts
* Search indexes
* LLM summaries
* Embeddings if introduced later
* Generated TTS audio
* Cached metadata

The architecture should make it possible to regenerate derived data without endangering the canonical archive.

---

# 57. Application Database

A lightweight database such as SQLite is appropriate.

Possible database responsibilities:

* Users
* Password hashes
* Sessions
* Invitations
* Admin state
* Search indexes
* Job state
* Synchronization state
* File discovery/cache
* Reflection metadata
* Internal configuration

SQLite should **not** become the only place in which diary content exists.

---

# 58. Search Index Rebuilding

Because search information is derived, the application should eventually support rebuilding its index from the diary directories.

The exact UX does not need to be prominent.

It may be:

* Startup consistency check
* Admin command
* CLI command
* Internal maintenance operation

The important architectural requirement is that rebuilding be possible.

---

# 59. Filesystem Reconciliation

The server administrator may manipulate the diary files directly.

The architecture should avoid assuming that the database is eternally perfectly synchronized with disk.

A reconciliation/indexing mechanism should therefore be possible.

For example:

```text
scan diary filesystem
       ↓
discover canonical objects
       ↓
compare index
       ↓
add/update missing index entries
```

This can be a maintenance function rather than a realtime watcher.

---

# 60. Development Environment

The coding agent should develop and test the application **through Docker**, rather than only running services directly on the host machine.

The repository should contain a development workflow that allows the agent/developer to:

* Build the container
* Start the Compose stack
* Run the application
* Run tests
* Inspect logs
* Exercise APIs

The production deployment mechanism and the development mechanism should remain reasonably similar.

---

# 61. Tests

The implementation plan should include automated testing for high-value behavior.

Especially important areas include:

* Authentication
* User isolation
* Day creation
* Audio upload
* Chunk retry/idempotency
* Offline synchronization logic
* File layout
* Transcript creation
* Search
* Reflection context selection
* Docker startup

Browser-level tests should cover the central user paths.

---

# 62. GitHub Repository

The project will be hosted on GitHub.

The repository should contain everything required to:

* Build the application
* Build Docker images
* Run tests
* Deploy via Docker Compose

---

# 63. Versioning

The project uses **semantic versioning**.

The canonical application version is the:

```json
{
  "version": "1.2.3"
}
```

field in `package.json`.

Version changes should therefore correspond to application releases.

---

# 64. Docker Image Publishing

A GitHub CI/CD workflow should publish new Docker images to Docker Hub when a new application version is released through the project's versioning flow.

The published Docker image should be tagged with the **complete semantic version**.

Example:

```text
repository/app:1.4.2
```

Also publish/update:

```text
repository/app:latest
```

Do not additionally require rolling major/minor tags such as:

```text
repository/app:1
repository/app:1.4
```

The full semantic version is the version-specific image identifier.

---

# 65. Version Consistency

The Docker image and application should expose the same version derived from `package.json`.

Avoid maintaining multiple manually synchronized version numbers.

The implementation plan should design the CI workflow so that publishing a release without changing the version cannot accidentally masquerade as a new semantic release.

---

# 66. Core User Path — Quick Voice Diary

```text
User opens PWA
        ↓
Today screen appears
        ↓
User presses Record
        ↓
Wake lock requested
        ↓
Audio recorded into durable local chunks
        ↓
User presses Stop
        ↓
Recording marked safely stored locally
        ↓
Upload begins / resumes
        ↓
Server receives all chunks
        ↓
Recording finalized on filesystem
        ↓
Transcription queued
        ↓
Local transcription service processes audio
        ↓
Transcript written to filesystem
        ↓
Search index updated
        ↓
UI shows recording + transcript
```

The user should not have to wait for transcription before leaving the application.

---

# 67. Core User Path — Recording Without Internet

```text
User opens cached PWA
        ↓
No server connection
        ↓
User presses Record
        ↓
Audio stored locally
        ↓
User stops
        ↓
UI shows "saved locally"
        ↓
User closes/reopens app later
        ↓
Internet available
        ↓
Upload automatically resumes
        ↓
Server stores recording
        ↓
Transcription proceeds normally
```

Network failure should be an inconvenience, not a reason for losing diary content.

---

# 68. Core User Path — Multiple Notes in a Day

```text
Morning
  ↓
User records audio

Afternoon
  ↓
User writes text note

Evening
  ↓
User records second audio note
  ↓
User adds image
  ↓
User adds tags "family", "holiday"
```

Opening that date later displays all objects as one day's diary.

---

# 69. Core User Path — Search

```text
User opens Search
        ↓
Types:
"battery project kosovo"
        ↓
Search FTS index
        ↓
Relevant transcripts/text/tags returned
        ↓
Results ranked
        ↓
User selects result
        ↓
Relevant diary day opens
```

Exact quotation matching should not be necessary for normal search.

---

# 70. Core User Path — Weekly Reflection

```text
User selects Reflection
        ↓
Selects "Week"
        ↓
System selects previous 7 days
        ↓
User records question:
"What seemed to stress me out this week?"
        ↓
Question transcribed
        ↓
Relevant diary text assembled/retrieved
        ↓
OpenRouter model analyzes it
        ↓
Text reflection returned
        ↓
Reflection automatically saved
        ↓
User optionally presses Listen
        ↓
TTS generated/playback begins
```

---

# 71. Core User Path — Long-Term Reflection

```text
User selects Reflection
        ↓
Selects "Year"
        ↓
System considers previous 365 days
        ↓
User asks:
"What themes kept recurring in my work?"
        ↓
System retrieves/summarizes diary corpus
        ↓
LLM produces grounded synthesis
        ↓
Response references relevant periods/days
        ↓
Reflection saved
```

The implementation should handle this without requiring all raw transcripts to fit into a single context window.

---

# 72. Core User Path — New Account

```text
Administrator opens user management
        ↓
Creates/authorizes email
        ↓
New user completes account setup
        ↓
User logs in
        ↓
Dedicated diary directory created
        ↓
User begins recording
```

Unapproved strangers cannot simply register accounts.

---

# 73. Initial Scope Priorities

The first useful version should focus on:

1. Authentication
2. Day-based diary model
3. Audio recording
4. Reliable/offline recording persistence
5. Resumable synchronization
6. Plain-file server storage
7. Automatic transcription
8. Text notes
9. Image/video attachments
10. Day tags
11. Search
12. Reflection
13. Saved reflections
14. Optional TTS
15. Dockerized deployment
16. GitHub/Docker Hub release automation

---

# 74. Explicit Non-Goals for Initial Version

Do not spend significant implementation effort on:

* Internet-scale scalability
* Kubernetes
* Microservice-heavy infrastructure
* Built-in TLS
* Application-level encryption of diary media
* Administrator UI for browsing other users' diaries
* Public signup
* Social networking
* Sharing diary posts
* Comments
* Likes
* Feed algorithms
* Rich collaborative editing
* Built-in export tooling
* Highly elaborate backup management
* Live speech transcription
* Mandatory semantic/vector search
* Media editing

The software should remain relatively small and understandable.

---

# 75. Design Principle: Boring Infrastructure

Prefer mature, simple components.

An approximate conceptual stack could therefore be:

```text
Browser / PWA
    │
    │ HTTPS through existing reverse proxy
    ▼
Reverse proxy
    │
    │ HTTP
    ▼
Application container
    ├── React/Vite static frontend
    ├── API
    ├── Auth
    ├── SQLite
    ├── Search
    ├── Sync coordinator
    ├── Reflection orchestration
    │
    ├──── App-data volume → NVMe
    │
    └──── Diary volume → RAID
             │
             ▼
       plain diary files

Application
    │
    ▼
Transcription container
    └── local STT model

Application
    │
    ▼
OpenRouter
    └── reflection LLM / configured external AI services
```

This diagram is illustrative, not a mandatory implementation prescription.

---

# 76. Important Implementation Principle: Recoverability

A useful test of the architecture is:

> If the application database disappeared but the diary volume survived, how much personal data would the user have lost?

The desired answer is:

**Almost none of the actual diary.**

Authentication state, indexes, or derived operational information may require reconstruction, but the meaningful personal archive should still exist as:

* Audio
* Text
* Images
* Video
* Transcripts
* Reflections
* Human-readable metadata

---

# 77. Important Implementation Principle: Failure Isolation

Failures in derived systems should not damage the diary.

Examples:

* OpenRouter unavailable → diary still records.
* Transcriber crashes → audio remains safely stored.
* Search index corrupt → files remain intact and index can be rebuilt.
* TTS provider unavailable → reflection text remains available.
* Network unavailable → recording remains stored locally until synchronization.
* RAID is slow → application database/UI state can still use NVMe storage.

---

# 78. Important Implementation Principle: Mobile First

The most important interface is a phone.

The primary workflow should be viable with one hand and minimal attention.

Recording should not require navigating through several menus.

Targets should be large enough for comfortable touch interaction.

Recording state should be visually unmistakable.

Important information during recording includes:

* Recording status
* Duration
* Stop control
* Local storage status
* Possibly microphone/input status

---

# 79. Important Implementation Principle: Long-Lived Archive

Assume the system may contain someone's diary for decades.

Avoid formats or architectural choices that make access dependent on:

* A particular frontend framework
* A proprietary database
* One AI provider
* One transcription engine

Plain files provide the archival foundation.

Application databases and AI systems enhance the archive rather than defining it.

---

# 80. Configuration

At minimum, deployment configuration will eventually need to cover concepts such as:

```text
Application-data volume/path
Diary-data volume/path

OpenRouter API key
Default OpenRouter model

Transcription model
Transcription service configuration

TTS provider/model/voice

Application hostname/origin where needed

Session/auth configuration
```

Secrets must not be committed to Git.

Docker Compose environment variables and/or an `.env` file are appropriate.

---

# 81. Open Implementation Decisions

The following details were intentionally **not fully fixed** in the requirements and should be resolved when producing the coding plan.

### Exact backend framework

The requirement is a single main application container, not a specific Node backend framework.

### Exact filesystem schema

The day-centric, human-readable structure is required; exact filenames/directories are not.

### Exact SQLite schema

Implementation detail.

### Exact transcription model

Whisper/faster-whisper and Parakeet are candidates.

### CPU vs GPU transcription

Should be configurable according to the host server.

### Exact TTS provider

Should remain replaceable/configurable.

### Transcript editing model

Manual corrections should be supported sensibly without being overwritten.

### Deletion semantics

Simple hard deletion versus an initial trash mechanism remains to be selected.

### Reflection summarization algorithm

Needs implementation planning, particularly for long date ranges.

### Advanced fuzzy/semantic search

FTS should form the baseline. More advanced retrieval may be added if justified.

---

# 82. What the Coding Agent Should Produce Next

This document is a **functional/product brief**, not yet the implementation plan.

The next step for the coding agent is to convert these requirements into a concrete development plan covering:

* Repository structure
* Technology choices
* Backend framework
* Database schema
* Filesystem schema
* HTTP/API design
* Authentication design
* PWA/service-worker strategy
* IndexedDB recording strategy
* Chunk upload protocol
* Synchronization state machine
* Media handling
* Transcription service API
* Job processing
* Search/indexing architecture
* Reflection retrieval strategy
* OpenRouter integration
* TTS integration
* Testing approach
* Docker images
* Docker Compose
* Development environment
* CI/CD workflow
* Migration/version strategy
* Incremental implementation milestones

The coding plan should preserve the central philosophy:

> **The application is a convenient interface over a durable, human-readable personal archive—not a database that happens to contain a diary.**
