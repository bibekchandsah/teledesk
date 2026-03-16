# Bugfix Requirements Document

## Introduction

The image spoiler feature in the chat application has two critical bugs affecting user experience:

1. **State Persistence Bug**: Revealed spoiler images remain revealed after page reload or chat switching, breaking the expected behavior where spoilers should always start in a hidden state.

2. **Upload Preview UI Bug**: The upload modal preview incorrectly displays interactive UI elements (shimmer effect and "SPOILER - Click to reveal" label) when the "Mark as spoiler" checkbox is checked. The preview should only show visual effects (blur + particles) without any interactive elements.

These bugs compromise the spoiler feature's core functionality and create confusion during the upload flow.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user reveals a spoiler image by clicking it THEN the system maintains the revealed state in component memory

1.2 WHEN a user reloads the page after revealing a spoiler THEN the system displays the image in revealed state instead of resetting to hidden

1.3 WHEN a user switches to another chat and returns after revealing a spoiler THEN the system displays the image in revealed state instead of resetting to hidden

1.4 WHEN a user checks "Mark as spoiler" in the upload modal THEN the system displays shimmer animation effect in the preview

1.5 WHEN a user checks "Mark as spoiler" in the upload modal THEN the system displays "SPOILER - Click to reveal" label in the preview

1.6 WHEN a user clicks on the spoiler preview in the upload modal THEN the system does not respond (correctly non-interactive) but still shows interactive UI elements

### Expected Behavior (Correct)

2.1 WHEN a user reveals a spoiler image by clicking it THEN the system SHALL store the revealed state only in component-local memory tied to the specific message instance

2.2 WHEN a user reloads the page after revealing a spoiler THEN the system SHALL display the image in hidden state with blur, particles, shimmer, and label

2.3 WHEN a user switches to another chat and returns after revealing a spoiler THEN the system SHALL display the image in hidden state with blur, particles, shimmer, and label

2.4 WHEN a user checks "Mark as spoiler" in the upload modal THEN the system SHALL display only blur effect and particles animation in the preview without shimmer effect

2.5 WHEN a user checks "Mark as spoiler" in the upload modal THEN the system SHALL display only blur effect and particles animation in the preview without "SPOILER - Click to reveal" label

2.6 WHEN a user clicks on the spoiler preview in the upload modal THEN the system SHALL not respond and SHALL not display any interactive UI elements

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user clicks a hidden spoiler image in a message THEN the system SHALL CONTINUE TO reveal the image by removing blur, particles, shimmer, and label effects

3.2 WHEN a user clicks a revealed spoiler image in a message THEN the system SHALL CONTINUE TO open the image preview modal

3.3 WHEN a user unchecks "Mark as spoiler" in the upload modal THEN the system SHALL CONTINUE TO display a clear, unblurred preview

3.4 WHEN a spoiler image is displayed in a message grid layout (MediaGroupBubble) THEN the system SHALL CONTINUE TO apply spoiler effects correctly

3.5 WHEN a spoiler image is displayed in a single message (MessageBubble) THEN the system SHALL CONTINUE TO apply spoiler effects correctly

3.6 WHEN a user sends a message with spoiler checkbox checked THEN the system SHALL CONTINUE TO transmit the isSpoiler flag to the backend and store it in the database

3.7 WHEN a user receives a message with isSpoiler flag set THEN the system SHALL CONTINUE TO render the image with spoiler effects applied

3.8 WHEN a spoiler video is displayed THEN the system SHALL CONTINUE TO apply the same spoiler effects as images
