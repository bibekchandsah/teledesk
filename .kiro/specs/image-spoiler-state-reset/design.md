# Image Spoiler State Reset Bugfix Design

## Overview

This bugfix addresses two critical issues in the image spoiler feature:

1. **State Persistence Bug**: Spoiler images remain revealed after page reload or chat switching, violating the expected behavior where spoilers should always start hidden.

2. **Upload Preview UI Bug**: The upload modal incorrectly displays interactive UI elements (shimmer effect and "SPOILER - Click to reveal" label) when previewing spoiler images, creating confusion about whether the preview is interactive.

The fix ensures spoilers always reset to hidden state on component remount and removes interactive UI elements from upload previews while maintaining the visual spoiler effect.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug - when a spoiler image is revealed and then the component remounts (page reload or chat switch), OR when the upload preview displays interactive UI elements
- **Property (P)**: The desired behavior - spoilers should always start hidden on mount, and upload previews should show only visual effects without interactive elements
- **Preservation**: Existing spoiler reveal/hide functionality, preview modal opening, and spoiler transmission to backend must remain unchanged
- **ImageSpoiler**: The component in `desktop-client/src/components/ImageSpoiler.tsx` that renders spoiler effects with blur, particles, shimmer, and label
- **isRevealed**: Local state in ImageSpoiler that controls whether the spoiler is hidden or revealed
- **disableReveal**: Prop that controls whether the spoiler is interactive (used for upload preview)
- **Component Remount**: When a React component is unmounted and mounted again, resetting all local state

## Bug Details

### Bug Condition

The bug manifests in two scenarios:

**Scenario 1 - State Persistence**: When a user reveals a spoiler image by clicking it, then reloads the page or switches to another chat and returns, the ImageSpoiler component remounts but the revealed state persists in some form (likely browser cache, localStorage, or incorrect state initialization).

**Scenario 2 - Upload Preview UI**: When a user checks "Mark as spoiler" in the upload modal, the preview displays shimmer animation and "SPOILER - Click to reveal" label, suggesting interactivity when the preview is actually non-interactive (disableReveal=true).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type { 
    scenario: 'state_persistence' | 'upload_preview',
    isRevealed?: boolean,
    isRemounting?: boolean,
    disableReveal?: boolean,
    showingShimmer?: boolean,
    showingLabel?: boolean
  }
  OUTPUT: boolean
  
  IF input.scenario == 'state_persistence' THEN
    RETURN input.isRevealed == true 
           AND input.isRemounting == true
           AND spoilerDisplaysAsRevealed()
  
  IF input.scenario == 'upload_preview' THEN
    RETURN input.disableReveal == true
           AND (input.showingShimmer == true OR input.showingLabel == true)
  
  RETURN false
END FUNCTION
```

### Examples

**State Persistence Bug:**
- User opens chat with Alice, sees spoiler image (hidden with blur/particles)
- User clicks spoiler → image reveals (blur/particles removed)
- User switches to chat with Bob, then switches back to Alice
- Expected: Spoiler is hidden again with blur/particles
- Actual: Spoiler remains revealed without blur/particles

**Upload Preview UI Bug:**
- User selects image to upload, opens upload modal
- User checks "Mark as spoiler" checkbox
- Expected: Preview shows blur + particles only (no shimmer, no label)
- Actual: Preview shows blur + particles + shimmer + "SPOILER - Click to reveal" label
- User clicks preview → nothing happens (correctly non-interactive)
- Confusion: Why does it show "Click to reveal" if clicking does nothing?

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Clicking a hidden spoiler in a message must continue to reveal the image
- Clicking a revealed spoiler in a message must continue to open the preview modal
- Spoiler effects (blur, particles) must continue to render correctly
- Upload modal "Mark as spoiler" checkbox must continue to work
- Spoiler flag transmission to backend must continue to work
- Spoiler rendering in both MessageBubble and MediaGroupBubble must continue to work

**Scope:**
All inputs that do NOT involve component remounting or upload preview rendering should be completely unaffected by this fix. This includes:
- Normal spoiler reveal/hide interactions in messages
- Preview modal opening from revealed spoilers
- Spoiler effects rendering on first mount
- Backend spoiler flag handling

## Hypothesized Root Cause

Based on the bug description and code analysis, the most likely issues are:

1. **State Initialization Issue**: The `isRevealed` state in ImageSpoiler.tsx is initialized to `false`, which should reset on remount. However, there may be:
   - Browser caching of the revealed image causing visual persistence
   - Parent component memoization preventing ImageSpoiler remount
   - Key prop missing on ImageSpoiler causing React to reuse the same component instance

2. **Conditional Rendering Logic**: The ImageSpoiler component shows shimmer and label when `(!isRevealed || disableReveal)` is true. This logic is incorrect because:
   - When `disableReveal=true` (upload preview), it should show ONLY blur + particles
   - When `disableReveal=false` (message), it should show blur + particles + shimmer + label
   - Current logic shows shimmer/label in both cases

3. **Component Key Missing**: The ImageSpoiler component in MessageBubble and MediaGroupBubble may not have a unique key tied to the message ID, causing React to reuse the same component instance across different messages or chat switches.

4. **Effect Cleanup Issue**: The particle animation effect may not be properly cleaning up when the component unmounts, causing visual artifacts to persist.

## Correctness Properties

Property 1: Bug Condition - Spoiler State Reset on Remount

_For any_ ImageSpoiler component that is remounted (due to page reload, chat switch, or message re-render), the component SHALL initialize with `isRevealed=false` and display the image with blur, particles, shimmer, and label effects, regardless of the previous revealed state before unmounting.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition - Upload Preview Visual-Only Display

_For any_ ImageSpoiler component rendered with `disableReveal=true` (upload preview mode), the component SHALL display ONLY blur effect and particles animation, and SHALL NOT display shimmer effect or "SPOILER - Click to reveal" label.

**Validates: Requirements 2.4, 2.5, 2.6**

Property 3: Preservation - Spoiler Reveal Interaction

_For any_ ImageSpoiler component in a message (disableReveal=false) that is clicked while hidden, the component SHALL reveal the image by setting `isRevealed=true` and removing blur, particles, shimmer, and label effects, preserving the existing reveal behavior.

**Validates: Requirements 3.1, 3.2**

Property 4: Preservation - Backend Spoiler Flag Transmission

_For any_ message sent with the "Mark as spoiler" checkbox checked, the system SHALL continue to transmit the `isSpoiler` flag to the backend and render received messages with spoiler effects when `isSpoiler=true`, preserving the existing backend integration.

**Validates: Requirements 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `desktop-client/src/components/ImageSpoiler.tsx`

**Component**: `ImageSpoiler`

**Specific Changes**:

1. **Fix Conditional Rendering for Upload Preview**:
   - Change shimmer effect condition from `!disableReveal` to `!disableReveal && !isRevealed`
   - Change label condition from `!disableReveal` to `!disableReveal && !isRevealed`
   - This ensures shimmer and label only show in message mode, not upload preview mode

2. **Verify State Initialization**:
   - Confirm `isRevealed` state is initialized to `false` (already correct)
   - Ensure no external state management (localStorage, context) is persisting revealed state

3. **Add Component Key in Parent Components**:
   - In `MessageBubble.tsx`: Add `key={message.messageId}` to ImageSpoiler components
   - In `ChatWindow.tsx` (MediaGroupBubble): Add `key={m.messageId}` to ImageSpoiler components
   - This forces React to create new component instances when message IDs change

4. **Verify Effect Cleanup**:
   - Confirm particle animation cleanup in useEffect return function
   - Ensure canvas is properly cleared on unmount

5. **Remove Unnecessary Conditions**:
   - Simplify overlay rendering logic to clearly separate upload preview mode from message mode

**Pseudocode for Fix**:
```
// In ImageSpoiler.tsx

// Current (buggy) shimmer rendering:
{!disableReveal && (
  <div style={{ /* shimmer */ }} />
)}

// Fixed shimmer rendering:
{!disableReveal && !isRevealed && (
  <div style={{ /* shimmer */ }} />
)}

// Current (buggy) label rendering:
{!disableReveal && (
  <div>SPOILER - Click to reveal</div>
)}

// Fixed label rendering:
{!disableReveal && !isRevealed && (
  <div>SPOILER - Click to reveal</div>
)}

// In MessageBubble.tsx and ChatWindow.tsx:
<ImageSpoiler
  key={message.messageId}  // Add this key
  src={message.fileUrl!}
  alt={message.fileName}
  onClick={() => onPreview?.(message)}
  style={{ width: '100%', height: '100%' }}
/>
```

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that simulate component remounting and upload preview rendering. Run these tests on the UNFIXED code to observe failures and understand the root cause.

**Test Cases**:
1. **State Persistence Test**: Render ImageSpoiler, click to reveal, unmount, remount → verify it shows as revealed (will fail on unfixed code)
2. **Chat Switch Test**: Open chat, reveal spoiler, switch to another chat, switch back → verify spoiler shows as revealed (will fail on unfixed code)
3. **Upload Preview Shimmer Test**: Render ImageSpoiler with disableReveal=true → verify shimmer is visible (will fail on unfixed code)
4. **Upload Preview Label Test**: Render ImageSpoiler with disableReveal=true → verify "SPOILER - Click to reveal" label is visible (will fail on unfixed code)

**Expected Counterexamples**:
- Spoiler remains revealed after remount (state not resetting)
- Upload preview shows shimmer animation (incorrect conditional)
- Upload preview shows "Click to reveal" label (incorrect conditional)
- Possible causes: missing component key, incorrect conditional logic, state persistence

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  IF input.scenario == 'state_persistence' THEN
    result := ImageSpoiler_fixed.render_after_remount(input)
    ASSERT result.isRevealed == false
    ASSERT result.showsBlur == true
    ASSERT result.showsParticles == true
    ASSERT result.showsShimmer == true
    ASSERT result.showsLabel == true
  
  IF input.scenario == 'upload_preview' THEN
    result := ImageSpoiler_fixed.render_with_disableReveal(input)
    ASSERT result.showsBlur == true
    ASSERT result.showsParticles == true
    ASSERT result.showsShimmer == false
    ASSERT result.showsLabel == false
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT ImageSpoiler_original(input) = ImageSpoiler_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain
- It catches edge cases that manual unit tests might miss
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs

**Test Plan**: Observe behavior on UNFIXED code first for normal spoiler interactions, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Reveal Interaction Preservation**: Click hidden spoiler in message → verify it reveals (should work on both unfixed and fixed code)
2. **Preview Modal Preservation**: Click revealed spoiler in message → verify preview modal opens (should work on both unfixed and fixed code)
3. **First Mount Rendering Preservation**: Render spoiler for first time → verify blur, particles, shimmer, label all show (should work on both unfixed and fixed code)
4. **Backend Flag Preservation**: Send message with spoiler checkbox → verify isSpoiler flag is transmitted (should work on both unfixed and fixed code)

### Unit Tests

- Test ImageSpoiler component initialization with isRevealed=false
- Test ImageSpoiler rendering with disableReveal=true (no shimmer, no label)
- Test ImageSpoiler rendering with disableReveal=false (shimmer, label visible when hidden)
- Test ImageSpoiler click behavior with disableReveal=true (no action)
- Test ImageSpoiler click behavior with disableReveal=false (reveals on first click)
- Test component key prop presence in MessageBubble and MediaGroupBubble

### Property-Based Tests

- Generate random sequences of reveal/hide/remount actions → verify spoiler always starts hidden after remount
- Generate random combinations of disableReveal and isRevealed states → verify shimmer/label only show when appropriate
- Generate random message IDs and chat switches → verify spoiler state resets correctly
- Test across many scenarios to ensure no edge cases break the fix

### Integration Tests

- Test full user flow: open chat → reveal spoiler → reload page → verify spoiler is hidden
- Test full user flow: open chat → reveal spoiler → switch chat → return → verify spoiler is hidden
- Test full user flow: select image → check "Mark as spoiler" → verify preview shows only blur + particles
- Test full user flow: send spoiler message → receive on another device → verify spoiler renders correctly
- Test spoiler in both single message and grid layout (MediaGroupBubble)
- Test spoiler with both images and videos
