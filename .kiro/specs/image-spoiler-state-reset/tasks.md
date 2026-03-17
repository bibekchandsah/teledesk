# Implementation Plan

- [-] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Spoiler State Persistence and Upload Preview UI
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: For deterministic bugs, scope the property to the concrete failing case(s) to ensure reproducibility
  - Test Scenario 1 (State Persistence): Render ImageSpoiler, click to reveal (isRevealed=true), unmount component, remount component → assert isRevealed=false and spoiler effects visible
  - Test Scenario 2 (Upload Preview UI): Render ImageSpoiler with disableReveal=true → assert shimmer effect is NOT visible and "SPOILER - Click to reveal" label is NOT visible
  - The test assertions should match the Expected Behavior Properties from design (Property 1 and Property 2)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause:
    - Scenario 1: Spoiler remains revealed after remount (isRevealed persists or visual state persists)
    - Scenario 2: Upload preview shows shimmer and/or label when disableReveal=true
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

- [ ] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Spoiler Reveal Interaction and Backend Integration
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs (normal spoiler interactions)
  - Test Case 1: Click hidden spoiler in message (disableReveal=false) → observe it reveals (isRevealed becomes true, blur/particles removed)
  - Test Case 2: Click revealed spoiler in message → observe preview modal opens (onClick handler called)
  - Test Case 3: Render spoiler for first time → observe blur, particles, shimmer, and label all show
  - Test Case 4: Send message with "Mark as spoiler" checkbox → observe isSpoiler flag is transmitted to backend
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements
  - Property-based testing generates many test cases for stronger guarantees
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 3. Fix for image spoiler state reset and upload preview UI

  - [ ] 3.1 Fix conditional rendering in ImageSpoiler.tsx
    - Change shimmer effect condition from `!disableReveal` to `!disableReveal && !isRevealed`
    - Change label condition from `!disableReveal` to `!disableReveal && !isRevealed`
    - This ensures shimmer and label only show in message mode when hidden, not in upload preview mode
    - _Bug_Condition: isBugCondition(input) where input.scenario='upload_preview' AND input.disableReveal=true AND (input.showingShimmer=true OR input.showingLabel=true)_
    - _Expected_Behavior: When disableReveal=true, component SHALL display ONLY blur + particles (no shimmer, no label)_
    - _Preservation: Existing spoiler reveal/hide functionality must remain unchanged_
    - _Requirements: 2.4, 2.5, 2.6, 3.1, 3.2_

  - [ ] 3.2 Add component key in MessageBubble.tsx
    - Add `key={message.messageId}` prop to all ImageSpoiler components in MessageBubble
    - This forces React to create new component instances when message IDs change, resetting local state
    - _Bug_Condition: isBugCondition(input) where input.scenario='state_persistence' AND input.isRevealed=true AND input.isRemounting=true_
    - _Expected_Behavior: When component remounts, isRevealed SHALL initialize to false with all spoiler effects visible_
    - _Preservation: Spoiler rendering in MessageBubble must continue to work correctly_
    - _Requirements: 2.1, 2.2, 2.3, 3.5_

  - [ ] 3.3 Add component key in ChatWindow.tsx (MediaGroupBubble)
    - Add `key={m.messageId}` prop to all ImageSpoiler components in MediaGroupBubble rendering
    - This forces React to create new component instances when message IDs change in grid layouts
    - _Bug_Condition: isBugCondition(input) where input.scenario='state_persistence' AND input.isRevealed=true AND input.isRemounting=true_
    - _Expected_Behavior: When component remounts, isRevealed SHALL initialize to false with all spoiler effects visible_
    - _Preservation: Spoiler rendering in MediaGroupBubble must continue to work correctly_
    - _Requirements: 2.1, 2.2, 2.3, 3.4_

  - [ ] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Spoiler State Reset and Upload Preview Visual-Only
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior
    - When this test passes, it confirms the expected behavior is satisfied
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - Verify Scenario 1: Spoiler resets to hidden state after remount
    - Verify Scenario 2: Upload preview shows only blur + particles (no shimmer, no label)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [ ] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Spoiler Reveal Interaction and Backend Integration
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all preservation tests still pass after fix:
      - Spoiler reveal interaction works correctly
      - Preview modal opens from revealed spoilers
      - First mount rendering shows all effects
      - Backend spoiler flag transmission works
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8_

- [ ] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
